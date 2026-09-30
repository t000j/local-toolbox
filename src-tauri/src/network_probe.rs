//! Bounded native network probes. No shell, PowerShell, PATH lookup, or DNS preflight.
//!
//! A prepared token owns the sole probe slot. Running claims it before validation,
//! and its RAII lease lives in the blocking worker until process/readers are gone.
//! A cancellation never kills by PID and cannot target a later probe.
use serde::Serialize;
use std::ffi::{c_void, OsString};
use std::io::{self, Read};
use std::net::IpAddr;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::process::CommandExt;
use std::os::windows::io::AsRawHandle;
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const PREPARED_JOB_TTL: Duration = Duration::from_secs(30);
const PING_DEADLINE: Duration = Duration::from_secs(30);
const TRACEROUTE_DEADLINE: Duration = Duration::from_secs(60);
const POLL_INTERVAL: Duration = Duration::from_millis(15);

#[link(name = "kernel32")]
extern "system" {
    fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
    fn SetInformationJobObject(job: *mut c_void, class: i32, information: *const c_void, size: u32) -> i32;
    fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
    fn CloseHandle(handle: *mut c_void) -> i32;
    fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32;
    fn GetOEMCP() -> u32;
    fn MultiByteToWideChar(
        code_page: u32,
        flags: u32,
        source: *const u8,
        source_len: i32,
        destination: *mut u16,
        destination_len: i32,
    ) -> i32;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeStatus {
    Completed,
    Cancelled,
    Timeout,
    OutputLimit,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    job_id: String,
    target: String,
    count: u32,
    timeout_ms: u32,
    output: String,
    status: ProbeStatus,
    exit_code: Option<i32>,
    elapsed_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteResult {
    job_id: String,
    target: String,
    max_hops: u32,
    timeout_ms: u32,
    output: String,
    status: ProbeStatus,
    exit_code: Option<i32>,
    elapsed_ms: u64,
}

struct JobControl {
    id: String,
    cancelled: AtomicBool,
}

struct Reservation {
    control: Arc<JobControl>,
    prepared_at: Instant,
    running: bool,
}

type JobSlot = Arc<Mutex<Option<Reservation>>>;

#[derive(Default)]
struct ProbeRegistry {
    slot: JobSlot,
    next_id: AtomicU64,
}

fn lock_slot(slot: &JobSlot) -> MutexGuard<'_, Option<Reservation>> {
    // Cleanup must still work if a previous worker unwound while holding the lock.
    slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl ProbeRegistry {
    fn prepare(&self) -> Result<String, String> {
        let mut slot = lock_slot(&self.slot);
        if slot.as_ref().is_some_and(|job| {
            !job.running && job.prepared_at.elapsed() >= PREPARED_JOB_TTL
        }) {
            *slot = None;
        }
        if slot.is_some() {
            return Err("已有网络诊断正在准备或运行，请先取消或等待完成。".to_owned());
        }
        let sequence = self.next_id.fetch_add(1, Ordering::Relaxed);
        let id = format!("network-probe-{}-{sequence}", std::process::id());
        *slot = Some(Reservation {
            control: Arc::new(JobControl {
                id: id.clone(),
                cancelled: AtomicBool::new(false),
            }),
            prepared_at: Instant::now(),
            running: false,
        });
        Ok(id)
    }

    fn acquire(&self, id: &str) -> Result<JobLease, String> {
        let mut slot = lock_slot(&self.slot);
        let job = slot.as_mut().filter(|job| job.control.id == id)
            .ok_or_else(|| "诊断任务已取消或过期，请重新开始。".to_owned())?;
        if job.running {
            return Err("此诊断任务已在运行，不能重复执行。".to_owned());
        }
        if job.prepared_at.elapsed() >= PREPARED_JOB_TTL {
            *slot = None;
            return Err("诊断任务准备时间过长，请重新开始。".to_owned());
        }
        job.running = true;
        Ok(JobLease { slot: Arc::clone(&self.slot), control: Arc::clone(&job.control) })
    }

    fn cancel(&self, id: &str) -> bool {
        let mut slot = lock_slot(&self.slot);
        let Some(job) = slot.as_ref().filter(|job| job.control.id == id) else { return false };
        job.control.cancelled.store(true, Ordering::Release);
        if !job.running {
            // No worker owns this token yet: release immediately. A late run is rejected.
            *slot = None;
        }
        true
    }
}

struct JobLease {
    slot: JobSlot,
    control: Arc<JobControl>,
}

impl JobLease {
    fn cancelled(&self) -> bool {
        self.control.cancelled.load(Ordering::Acquire)
    }
}

impl Drop for JobLease {
    fn drop(&mut self) {
        let mut slot = lock_slot(&self.slot);
        if slot.as_ref().is_some_and(|job| Arc::ptr_eq(&job.control, &self.control)) {
            *slot = None;
        }
    }
}

fn registry() -> &'static ProbeRegistry {
    static REGISTRY: OnceLock<ProbeRegistry> = OnceLock::new();
    REGISTRY.get_or_init(ProbeRegistry::default)
}

fn validate_target(target: &str) -> Result<(), String> {
    if target.is_empty() || target.len() > 253 || !target.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b':')
    }) {
        return Err("请输入单个 ASCII 主机名或 IP；不支持 URL、端口、区域 ID、空格或命令参数。".to_owned());
    }
    if target.contains(':') {
        return match target.parse::<IpAddr>() {
            Ok(IpAddr::V6(_)) => Ok(()),
            _ => Err("IPv6 地址格式无效；不支持区域 ID。".to_owned()),
        };
    }
    if target.bytes().all(|byte| byte.is_ascii_digit() || byte == b'.') {
        return match target.parse::<IpAddr>() {
            Ok(IpAddr::V4(_)) => Ok(()),
            _ => Err("IPv4 地址应为四段 0–255 的十进制数字，不接受前导零或简写。".to_owned()),
        };
    }
    let hostname = target.strip_suffix('.').unwrap_or(target);
    if !hostname.split('.').all(|label| {
        let bytes = label.as_bytes();
        !bytes.is_empty() && bytes.len() <= 63
            && bytes[0].is_ascii_alphanumeric()
            && bytes[bytes.len() - 1].is_ascii_alphanumeric()
            && bytes.iter().all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
    }) {
        return Err("主机名每段限 1–63 个英文字母、数字或中划线，首尾不能是中划线。".to_owned());
    }
    Ok(())
}

fn traceroute_args(target: &str, max_hops: u32, timeout_ms: u32) -> Result<Vec<String>, String> {
    validate_target(target)?;
    if !(1..=30).contains(&max_hops) { return Err("最大跳数应为 1–30 跳。".to_owned()); }
    if !(250..=2000).contains(&timeout_ms) { return Err("每次回复超时应为 250–2000 毫秒。".to_owned()); }
    // Disable reverse lookups for intermediate hops; resolving a hostname target
    // still uses system DNS. Each value remains a separate argument, with no shell.
    Ok(vec![
        "-d".to_owned(), "-h".to_owned(), max_hops.to_string(),
        "-w".to_owned(), timeout_ms.to_string(), target.to_owned(),
    ])
}

fn system_executable(name: &str) -> Result<PathBuf, String> {
    // Query Windows itself rather than trusting PATH or a modified SystemRoot.
    let mut directory = vec![0_u16; 32_768];
    let length = unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) };
    if length == 0 || length as usize >= directory.len() {
        return Err(format!("无法定位 Windows 系统目录：{}", io::Error::last_os_error()));
    }
    directory.truncate(length as usize);
    Ok(PathBuf::from(OsString::from_wide(&directory)).join(name))
}

struct CaptureBudget {
    remaining: AtomicUsize,
    exceeded: AtomicBool,
    failed: AtomicBool,
}

impl CaptureBudget {
    fn new() -> Self {
        Self {
            remaining: AtomicUsize::new(MAX_OUTPUT_BYTES),
            exceeded: AtomicBool::new(false),
            failed: AtomicBool::new(false),
        }
    }

    fn take(&self, length: usize) -> usize {
        let previous = self.remaining.fetch_update(Ordering::AcqRel, Ordering::Acquire, |left| {
            Some(left.saturating_sub(length))
        }).unwrap_or(0);
        let accepted = previous.min(length);
        if accepted != length {
            self.exceeded.store(true, Ordering::Release);
        }
        accepted
    }
}

type OutputReader = JoinHandle<Result<Vec<u8>, String>>;

fn start_reader<R: Read + Send + 'static>(
    mut pipe: R,
    budget: Arc<CaptureBudget>,
    name: &str,
) -> Result<OutputReader, String> {
    thread::Builder::new().name(name.to_owned()).spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            match pipe.read(&mut buffer) {
                Ok(0) => return Ok(output),
                Ok(length) => {
                    let accepted = budget.take(length);
                    output.extend_from_slice(&buffer[..accepted]);
                    // Keep draining until the owner terminates/reaps the child.
                    // Returning early can otherwise leave a child blocked on its pipe.
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => {
                    budget.failed.store(true, Ordering::Release);
                    return Err(format!("读取诊断输出失败：{error}"));
                }
            }
        }
    }).map_err(|error| format!("无法创建诊断输出读取线程：{error}"))
}

#[derive(Default)]
#[repr(C)]
struct BasicJobLimits {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[derive(Default)]
#[repr(C)]
struct ExtendedJobLimits {
    basic: BasicJobLimits,
    io_counters: [u64; 6],
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

/// A non-inheritable job handle causes Windows to terminate its assigned probe
/// when the application closes/crashes, even if Rust destructors cannot run.
struct ProcessJob(*mut c_void);

impl ProcessJob {
    fn create() -> Result<Self, String> {
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(format!("无法创建诊断进程保护：{}", io::Error::last_os_error()));
        }
        let job = Self(handle);
        let mut limits = ExtendedJobLimits::default();
        limits.basic.limit_flags = 0x0000_2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        let success = unsafe {
            SetInformationJobObject(job.0, 9, &limits as *const _ as *const c_void, std::mem::size_of::<ExtendedJobLimits>() as u32)
        };
        if success == 0 {
            return Err(format!("无法启用诊断退出保护：{}", io::Error::last_os_error()));
        }
        Ok(job)
    }

    fn assign(&self, child: &Child) -> Result<(), String> {
        if unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle()) } == 0 {
            return Err(format!("无法保护诊断进程，已中止启动：{}", io::Error::last_os_error()));
        }
        Ok(())
    }
}

impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0); }
    }
}

/// Owns every child resource, including on partial setup, I/O failure and unwind.
struct ProbeProcess {
    child: Child,
    job: Option<ProcessJob>,
    reaped: bool,
    stdout: Option<OutputReader>,
    stderr: Option<OutputReader>,
}

impl ProbeProcess {
    fn poll(&mut self) -> Result<Option<ExitStatus>, String> {
        let status = self.child.try_wait().map_err(|error| format!("读取诊断进程状态失败：{error}"))?;
        if status.is_some() { self.reaped = true; }
        Ok(status)
    }

    fn kill_and_wait(&mut self) -> Result<ExitStatus, String> {
        if !self.reaped {
            self.job.take(); // KILL_ON_JOB_CLOSE also prevents descendants holding pipes open.
            // Kill only the owned Child handle. If it exited concurrently, wait still reaps it.
            let _ = self.child.kill();
        }
        let status = self.child.wait().map_err(|error| format!("等待诊断进程退出失败：{error}"))?;
        self.reaped = true;
        Ok(status)
    }

    fn join_readers(&mut self) -> Result<(Vec<u8>, Vec<u8>), String> {
        // The root process is reaped by every caller; also close the job before
        // joining so an unexpected descendant cannot retain an inherited pipe.
        self.job.take();
        fn join(reader: Option<OutputReader>) -> Result<Vec<u8>, String> {
            match reader {
                Some(reader) => reader.join().map_err(|_| "诊断输出读取线程异常结束。".to_owned())?,
                None => Ok(Vec::new()),
            }
        }
        // Join both before propagating either error. No detached reader can outlive the lease.
        let stdout = join(self.stdout.take());
        let stderr = join(self.stderr.take());
        Ok((stdout?, stderr?))
    }
}

impl Drop for ProbeProcess {
    fn drop(&mut self) {
        if !self.reaped {
            self.job.take();
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
        let _ = self.join_readers();
    }
}

fn decode_oem(bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() { return Ok(String::new()); }
    // Windows console utilities emit the system OEM code page (e.g. CP936 on
    // Chinese Windows), not necessarily UTF-8 or the ANSI code page.
    let code_page = unsafe { GetOEMCP() };
    let length = unsafe {
        MultiByteToWideChar(code_page, 0, bytes.as_ptr(), bytes.len() as i32, std::ptr::null_mut(), 0)
    };
    if length <= 0 { return Err("无法解码 Windows 诊断输出。".to_owned()); }
    let mut wide = vec![0_u16; length as usize];
    let written = unsafe {
        MultiByteToWideChar(code_page, 0, bytes.as_ptr(), bytes.len() as i32, wide.as_mut_ptr(), length)
    };
    if written <= 0 { return Err("无法解码 Windows 诊断输出。".to_owned()); }
    wide.truncate(written as usize);
    Ok(String::from_utf16_lossy(&wide))
}

fn clip_output(output: &mut String) -> bool {
    if output.len() <= MAX_OUTPUT_BYTES { return false; }
    let mut boundary = MAX_OUTPUT_BYTES;
    while !output.is_char_boundary(boundary) { boundary -= 1; }
    output.truncate(boundary);
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeExecution {
    output: String,
    status: ProbeStatus,
    exit_code: Option<i32>,
    elapsed_ms: u64,
}

/// Common bounded runner for fixed executables, validated argument lists and
/// deadlines, with identical ownership and cancellation for Ping and traceroute.
fn execute_probe(
    lease: &JobLease,
    executable: &str,
    args: &[String],
    started: Instant,
    deadline: Duration,
) -> Result<ProbeExecution, String> {
    let empty_result = |status| ProbeExecution {
        output: String::new(), status, exit_code: None, elapsed_ms: started.elapsed().as_millis() as u64,
    };
    if lease.cancelled() { return Ok(empty_result(ProbeStatus::Cancelled)); }
    if started.elapsed() >= deadline { return Ok(empty_result(ProbeStatus::Timeout)); }
    let path = system_executable(executable)?;
    let job = ProcessJob::create()?;
    if lease.cancelled() { return Ok(empty_result(ProbeStatus::Cancelled)); }
    if started.elapsed() >= deadline { return Ok(empty_result(ProbeStatus::Timeout)); }
    let child = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("启动 Windows 诊断命令失败：{error}"))?;
    let mut process = ProbeProcess { child, job: Some(job), reaped: false, stdout: None, stderr: None };
    // Stable std::Command cannot assign a job atomically with process creation.
    // Abrupt application death in this tiny spawn-to-assignment interval is the
    // remaining best-effort exit-cleanup limitation; later exits are kernel-covered.
    if let Some(job) = &process.job { job.assign(&process.child)?; }
    let budget = Arc::new(CaptureBudget::new());
    let stdout = process.child.stdout.take().ok_or_else(|| "无法打开诊断标准输出。".to_owned())?;
    let stderr = process.child.stderr.take().ok_or_else(|| "无法打开诊断错误输出。".to_owned())?;
    process.stdout = Some(start_reader(stdout, Arc::clone(&budget), "network-probe-stdout")?);
    process.stderr = Some(start_reader(stderr, Arc::clone(&budget), "network-probe-stderr")?);

    let (mut status, exit_status) = loop {
        let stopped = if lease.cancelled() {
            Some(ProbeStatus::Cancelled)
        } else if started.elapsed() >= deadline {
            Some(ProbeStatus::Timeout)
        } else if budget.exceeded.load(Ordering::Acquire) {
            Some(ProbeStatus::OutputLimit)
        } else { None };
        if let Some(status) = stopped {
            break (status, process.kill_and_wait()?);
        }
        if budget.failed.load(Ordering::Acquire) {
            return Err("诊断输出读取失败，进程已停止。".to_owned());
        }
        if let Some(exit_status) = process.poll()? {
            break (ProbeStatus::Completed, exit_status);
        }
        thread::sleep(POLL_INTERVAL.min(deadline.saturating_sub(started.elapsed())));
    };
    let (stdout, stderr) = process.join_readers()?;
    let mut output = decode_oem(&stdout)?;
    let stderr = decode_oem(&stderr)?;
    if !stderr.is_empty() {
        if !output.is_empty() && !output.ends_with('\n') { output.push('\n'); }
        output.push_str(&stderr);
    }
    let text_clipped = clip_output(&mut output);
    if status == ProbeStatus::Completed && (text_clipped || budget.exceeded.load(Ordering::Acquire)) {
        status = ProbeStatus::OutputLimit;
    }
    Ok(ProbeExecution {
        output,
        status,
        // Forced-termination exit codes are not diagnostic results.
        exit_code: if status == ProbeStatus::Completed { exit_status.code() } else { None },
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub fn prepare_network_probe() -> Result<String, String> {
    registry().prepare()
}

#[tauri::command]
pub fn cancel_network_probe(job_id: String) -> bool {
    registry().cancel(&job_id)
}

#[tauri::command]
pub async fn run_ping(job_id: String, target: String, count: u32, timeout_ms: u32) -> Result<PingResult, String> {
    // Acquire BEFORE all validation so every attempted run consumes its reservation.
    // Keeping this in the worker also handles dropped invoke futures and panics.
    let lease = registry().acquire(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        validate_target(&target)?;
        if !(1..=10).contains(&count) { return Err("Ping 次数应为 1–10 次。".to_owned()); }
        if !(250..=2000).contains(&timeout_ms) { return Err("每次回复超时应为 250–2000 毫秒。".to_owned()); }
        let args = vec!["-n".to_owned(), count.to_string(), "-w".to_owned(), timeout_ms.to_string(), target.clone()];
        let execution = execute_probe(&_lease, "ping.exe", &args, started, PING_DEADLINE)?;
        Ok(PingResult {
            job_id, target, count, timeout_ms,
            output: execution.output, status: execution.status,
            exit_code: execution.exit_code, elapsed_ms: execution.elapsed_ms,
        })
    }).await.map_err(|error| format!("诊断工作线程异常结束：{error}"))?
}

#[tauri::command]
pub async fn run_traceroute(job_id: String, target: String, max_hops: u32, timeout_ms: u32) -> Result<TracerouteResult, String> {
    // Use the same single-token lease as Ping. Validation errors consume the
    // reservation, and cancelling never releases the slot before worker cleanup.
    let lease = registry().acquire(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let args = traceroute_args(&target, max_hops, timeout_ms)?;
        let execution = execute_probe(&_lease, "tracert.exe", &args, started, TRACEROUTE_DEADLINE)?;
        Ok(TracerouteResult {
            job_id, target, max_hops, timeout_ms,
            output: execution.output, status: execution.status,
            exit_code: execution.exit_code, elapsed_ms: execution.elapsed_ms,
        })
    }).await.map_err(|error| format!("诊断工作线程异常结束：{error}"))?
}

fn validate_dns_target(target: &str) -> Result<(), String> {
    if !target.contains('_') { return validate_target(target); }
    let name = target.strip_suffix('.').unwrap_or(target);
    let valid = target.len() <= 253 && name.split('.').all(|label| {
        let bytes = label.as_bytes();
        let edge = |byte: u8| byte.is_ascii_alphanumeric() || byte == b'_';
        !bytes.is_empty() && bytes.len() <= 63 && edge(bytes[0]) && edge(bytes[bytes.len() - 1])
            && bytes.iter().all(|byte| edge(*byte) || *byte == b'-')
    });
    if valid { Ok(()) } else { Err("请输入有效 ASCII DNS 记录名称，不支持空格、URL 或命令参数。".to_owned()) }
}

fn dns_args(target: &str, record_type: &str) -> Result<Vec<String>, String> {
    validate_dns_target(target)?;
    if !["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR"].contains(&record_type) {
        return Err("不支持此 DNS 记录类型。".to_owned());
    }
    // A trailing dot prevents implicit search suffixes and command-word ambiguity.
    let name = if target.parse::<IpAddr>().is_ok() || target.ends_with('.') {
        target.to_owned()
    } else { format!("{target}.") };
    Ok(vec![format!("-type={record_type}"), "-timeout=2".to_owned(),
        "-retry=1".to_owned(), "-nosearch".to_owned(), name])
}

#[tauri::command]
pub async fn run_dns_query(job_id: String, target: String, record_type: String) -> Result<ProbeExecution, String> {
    let lease = registry().acquire(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let args = dns_args(&target, &record_type)?;
        execute_probe(&lease, "nslookup.exe", &args, started, Duration::from_secs(15))
    }).await.map_err(|error| format!("诊断工作线程异常结束：{error}"))?
}

fn dns_cache_args(flush: bool, confirmed: bool) -> Result<Vec<String>, String> {
    if flush && !confirmed { return Err("请先确认清空本机 DNS 缓存的影响。".to_owned()); }
    Ok(vec![if flush { "/flushdns" } else { "/displaydns" }.to_owned()])
}

#[tauri::command]
pub async fn run_dns_cache(job_id: String, flush: bool, confirmed: bool) -> Result<ProbeExecution, String> {
    let lease = registry().acquire(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let args = dns_cache_args(flush, confirmed)?;
        // No elevation or retry with different permissions. Never release/renew adapters.
        execute_probe(&lease, "ipconfig.exe", &args, started, Duration::from_secs(15))
    }).await.map_err(|error| format!("诊断工作线程异常结束：{error}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpSnapshot {
    #[serde(flatten)]
    snapshot: ProbeExecution,
    process_output: String,
    process_warning: String,
}

#[tauri::command]
pub async fn run_tcp_snapshot(job_id: String) -> Result<TcpSnapshot, String> {
    let lease = registry().acquire(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Duration::from_secs(20);
        // -n prevents reverse DNS. Include all families, then the UI selects TCP
        // rows; UDP rows remain only in the explicitly labelled raw output.
        let mut snapshot = execute_probe(&lease, "netstat.exe", &["-ano".to_owned()], started, deadline)?;
        let mut process_output = String::new();
        let mut process_warning = "连接表未完整读取，未继续获取进程名称。".to_owned();
        if snapshot.status == ProbeStatus::Completed && snapshot.exit_code == Some(0) {
            match execute_probe(&lease, "tasklist.exe", &["/FO".to_owned(), "CSV".to_owned(), "/NH".to_owned()], started, deadline) {
                Ok(names) => {
                    process_warning = if names.status == ProbeStatus::Completed && names.exit_code == Some(0) {
                        String::new()
                    } else { "进程名称快照不完整或读取失败；未知名称保留 PID。".to_owned() };
                    if names.status != ProbeStatus::Completed {
                        snapshot.status = names.status;
                        snapshot.exit_code = None;
                    }
                    process_output = names.output;
                }
                Err(error) => { process_warning = error; }
            }
        }
        snapshot.elapsed_ms = started.elapsed().as_millis() as u64;
        Ok(TcpSnapshot { snapshot, process_output, process_warning })
    }).await.map_err(|error| format!("诊断工作线程异常结束：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dns_cache_requires_explicit_flush_confirmation() {
        assert_eq!(dns_cache_args(false, false).unwrap(), ["/displaydns"]);
        assert_eq!(dns_cache_args(true, true).unwrap(), ["/flushdns"]);
        assert!(dns_cache_args(true, false).is_err());
    }

    #[test]
    fn dns_arguments_are_fixed_and_validated() {
        assert_eq!(dns_args("example.com", "MX").unwrap(), ["-type=MX", "-timeout=2", "-retry=1", "-nosearch", "example.com."]);
        assert_eq!(dns_args("192.0.2.1", "PTR").unwrap().last().unwrap(), "192.0.2.1");
        assert_eq!(dns_args("exit", "A").unwrap().last().unwrap(), "exit.");
        for kind in ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR"] { assert!(dns_args("example.com.", kind).is_ok()); }
        for kind in ["ANY", "A -debug", "", "a"] { assert!(dns_args("example.com", kind).is_err()); }
        assert!(dns_args("-", "A").is_err());
        assert!(dns_args("_dmarc.example.com", "TXT").is_ok());
        assert!(dns_args("selector._domainkey.example.com", "TXT").is_ok());
        for target in ["_a;whoami", "_a -debug", "_-", "a.._b", "_a:80", "_a/", "_a\n"] {
            assert!(dns_args(target, "TXT").is_err());
        }
    }

    #[test]
    fn target_validation_accepts_plain_dns_and_ip_only() {
        for target in ["localhost", "example.com", "EXAMPLE.com.", "my-host.lan", "0.0.0.0", "255.255.255.255", "::1", "2001:db8::1", "::ffff:192.0.2.1"] {
            assert!(validate_target(target).is_ok(), "{target}");
        }
        for target in ["", " ", " example.com", "example.com\n", "-t", "/t", "a;whoami", "a&b", "a|b", "a`b", "a$b", "a%b", "a\"b", "a\\b", "https://example.com", "example.com:80", "[::1]", "fe80::1%12", "2001:db8::g", "1.2.3", "123", "1.2.3.256", "01.2.3.4", "1.2.3.4.", "a..b", ".example", "-example.com", "example-.com", "_srv.example", "例子.cn"] {
            assert!(validate_target(target).is_err(), "{target}");
        }
        assert!(validate_target(&format!("{}.test", "a".repeat(63))).is_ok());
        assert!(validate_target(&format!("{}.test", "a".repeat(64))).is_err());
        assert!(validate_target(&["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(61)].join(".")).is_ok());
        assert!(validate_target(&["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(62)].join(".")).is_err());
    }

    #[test]
    fn traceroute_arguments_are_fixed_and_disable_reverse_dns() {
        assert_eq!(traceroute_args("example.com", 30, 2000).unwrap(), ["-d", "-h", "30", "-w", "2000", "example.com"]);
        assert_eq!(traceroute_args("2001:db8::1", 1, 250).unwrap(), ["-d", "-h", "1", "-w", "250", "2001:db8::1"]);
        assert_eq!(TRACEROUTE_DEADLINE, Duration::from_secs(60));
        assert_eq!(PING_DEADLINE, Duration::from_secs(30));
    }

    #[test]
    fn traceroute_configuration_accepts_inclusive_bounds() {
        for max_hops in [1, 15, 30] {
            for timeout_ms in [250, 1000, 2000] {
                assert!(traceroute_args("localhost", max_hops, timeout_ms).is_ok());
            }
        }
    }

    #[test]
    fn traceroute_configuration_rejects_out_of_range_values() {
        for max_hops in [0, 31, u32::MAX] {
            assert!(traceroute_args("localhost", max_hops, 1000).is_err());
        }
        for timeout_ms in [0, 249, 2001, u32::MAX] {
            assert!(traceroute_args("localhost", 30, timeout_ms).is_err());
        }
    }

    #[test]
    fn traceroute_rejects_targets_before_constructing_arguments() {
        for target in ["", "-d", "a -h 99", "https://example.com", "a&whoami", "example.com:80", "fe80::1%12"] {
            assert!(traceroute_args(target, 30, 1000).is_err(), "{target}");
        }
    }

    #[test]
    fn invalid_traceroute_configuration_releases_claimed_slot() {
        let registry = ProbeRegistry::default();
        for (max_hops, timeout_ms) in [(0, 1000), (30, 249)] {
            let id = registry.prepare().unwrap();
            let result = (|| -> Result<Vec<String>, String> {
                let _lease = registry.acquire(&id)?;
                traceroute_args("localhost", max_hops, timeout_ms)
            })();
            assert!(result.is_err());
            assert!(lock_slot(&registry.slot).is_none());
        }
    }

    #[test]
    fn cancelled_preparation_releases_slot_without_affecting_new_job() {
        let registry = ProbeRegistry::default();
        let first = registry.prepare().unwrap();
        assert!(registry.cancel(&first));
        let second = registry.prepare().unwrap();
        assert!(!registry.cancel(&first));
        assert!(registry.acquire(&first).is_err());
        assert!(registry.acquire(&second).is_ok());
    }

    #[test]
    fn running_lease_is_exclusive_until_cleanup() {
        let registry = ProbeRegistry::default();
        let id = registry.prepare().unwrap();
        let lease = registry.acquire(&id).unwrap();
        assert!(registry.acquire(&id).is_err());
        assert!(registry.prepare().is_err());
        assert!(registry.cancel(&id));
        assert!(lease.cancelled());
        assert!(registry.prepare().is_err());
        drop(lease);
        assert!(registry.prepare().is_ok());
    }

    #[test]
    fn orphaned_preparation_expires() {
        let registry = ProbeRegistry::default();
        let old = registry.prepare().unwrap();
        lock_slot(&registry.slot).as_mut().unwrap().prepared_at = Instant::now() - PREPARED_JOB_TTL;
        let next = registry.prepare().unwrap();
        assert_ne!(old, next);
        assert!(registry.acquire(&old).is_err());
        lock_slot(&registry.slot).as_mut().unwrap().prepared_at = Instant::now() - PREPARED_JOB_TTL;
        assert!(registry.acquire(&next).is_err());
        assert!(registry.prepare().is_ok());
    }

    #[test]
    fn validation_failure_releases_claimed_slot() {
        let registry = ProbeRegistry::default();
        let id = registry.prepare().unwrap();
        let result = (|| -> Result<(), String> {
            let _lease = registry.acquire(&id)?;
            validate_target("-t")
        })();
        assert!(result.is_err());
        assert!(registry.prepare().is_ok());
    }

    #[test]
    fn shared_budget_never_captures_more_than_limit() {
        let budget = CaptureBudget::new();
        assert_eq!(budget.take(MAX_OUTPUT_BYTES - 1), MAX_OUTPUT_BYTES - 1);
        assert_eq!(budget.take(10), 1);
        assert_eq!(budget.take(10), 0);
        assert!(budget.exceeded.load(Ordering::Acquire));
        let mut output = "中".repeat(MAX_OUTPUT_BYTES);
        assert!(clip_output(&mut output));
        assert!(output.len() <= MAX_OUTPUT_BYTES);
        assert!(output.ends_with('中'));
    }
    #[test]
    fn concurrent_readers_share_one_capture_limit() {
        let budget = Arc::new(CaptureBudget::new());
        let stdout = start_reader(io::Cursor::new(vec![b'a'; MAX_OUTPUT_BYTES]), Arc::clone(&budget), "test-stdout").unwrap();
        let stderr = start_reader(io::Cursor::new(vec![b'b'; MAX_OUTPUT_BYTES]), Arc::clone(&budget), "test-stderr").unwrap();
        let stdout = stdout.join().unwrap().unwrap();
        let stderr = stderr.join().unwrap().unwrap();
        assert_eq!(stdout.len() + stderr.len(), MAX_OUTPUT_BYTES);
        assert!(budget.exceeded.load(Ordering::Acquire));
    }

}
