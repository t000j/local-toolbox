use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Output};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapterInfo {
    friendly_name: String,
    description: String,
    adapter_type: String,
    is_up: bool,
    ipv4_addresses: Vec<String>,
    ipv6_addresses: Vec<String>,
    gateways: Vec<String>,
    dns_servers: Vec<String>,
    physical_address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortProcessInfo {
    local_address: String,
    remote_address: String,
    state: String,
    process_id: u32,
    process_name: String,
}

fn run_windows_command(name: &str, args: &[&str]) -> Result<Output, String> {
    let system_root = env::var_os("SystemRoot").ok_or("无法定位 Windows 系统目录")?;
    let executable = PathBuf::from(system_root).join("System32").join(name);
    Command::new(executable)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("运行本机诊断命令失败：{error}"))
}

fn process_name_for(process_id: u32) -> String {
    let pid_filter = format!("PID eq {process_id}");
    let output = run_windows_command("tasklist.exe", &["/FI", &pid_filter, "/FO", "CSV", "/NH"]);
    let Ok(output) = output else { return "未知进程".to_owned() };
    if !output.status.success() {
        return "未知进程".to_owned();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| {
            let row = line.trim();
            let name = row.strip_prefix('"')?.split(',').next()?.trim_end_matches('"');
            (!name.is_empty()).then(|| name.to_owned())
        })
        .unwrap_or_else(|| "未知进程".to_owned())
}

fn is_listening_state(state: &str) -> bool {
    let state = state.to_ascii_lowercase();
    state.contains("listen") || state.contains("侦听") || state.contains("监听")
}

#[tauri::command]
pub fn get_network_info() -> Result<Vec<NetworkAdapterInfo>, String> {
    let adapters = ipconfig::get_adapters().map_err(|error| error.to_string())?;

    Ok(adapters
        .into_iter()
        .map(|adapter| {
            let adapter_type = match adapter.if_type() {
                ipconfig::IfType::EthernetCsmacd => "Ethernet",
                ipconfig::IfType::Ieee80211 => "Wi-Fi",
                ipconfig::IfType::SoftwareLoopback => "Loopback",
                ipconfig::IfType::Ppp => "PPP",
                ipconfig::IfType::Tunnel => "Tunnel",
                _ => "其他",
            };
            let physical_address = adapter
                .physical_address()
                .filter(|address| !address.is_empty())
                .map(|address| address.iter().map(|byte| format!("{byte:02X}")).collect::<Vec<_>>().join(":"))
                .unwrap_or_default();

            NetworkAdapterInfo {
                friendly_name: adapter.friendly_name().to_owned(),
                description: adapter.description().to_owned(),
                adapter_type: adapter_type.to_owned(),
                is_up: adapter.oper_status() == ipconfig::OperStatus::IfOperStatusUp,
                ipv4_addresses: adapter.ip_addresses().iter().filter(|address| address.is_ipv4()).map(ToString::to_string).collect(),
                ipv6_addresses: adapter.ip_addresses().iter().filter(|address| address.is_ipv6()).map(ToString::to_string).collect(),
                gateways: adapter.gateways().iter().map(ToString::to_string).collect(),
                dns_servers: adapter.dns_servers().iter().map(ToString::to_string).collect(),
                physical_address,
            }
        })
        .collect())
}

#[tauri::command]
pub fn find_port_owners(port: u16) -> Result<Vec<PortProcessInfo>, String> {
    if port == 0 {
        return Err("端口范围应为 1 到 65535。".to_owned());
    }

    let output = run_windows_command("netstat.exe", &["-ano", "-p", "tcp"])?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() { "读取 TCP 连接表失败。".to_owned() } else { detail });
    }

    let mut matches = Vec::new();
    let mut process_ids = HashSet::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut fields = line.split_whitespace();
        if !fields.next().is_some_and(|protocol| protocol.eq_ignore_ascii_case("TCP")) {
            continue;
        }
        let Some(local_address) = fields.next() else { continue };
        let Some(remote_address) = fields.next() else { continue };
        let Some(state) = fields.next() else { continue };
        let Some(process_id) = fields.next().and_then(|value| value.parse::<u32>().ok()) else { continue };
        let Some(local_port) = local_address.rsplit_once(':').and_then(|(_, value)| value.parse::<u16>().ok()) else { continue };
        if local_port != port {
            continue;
        }

        process_ids.insert(process_id);
        matches.push(PortProcessInfo {
            local_address: local_address.to_owned(),
            remote_address: remote_address.to_owned(),
            state: state.to_owned(),
            process_id,
            process_name: String::new(),
        });
    }

    let process_names: HashMap<u32, String> = process_ids.into_iter().map(|pid| (pid, process_name_for(pid))).collect();
    for entry in &mut matches {
        entry.process_name = process_names.get(&entry.process_id).cloned().unwrap_or_else(|| "未知进程".to_owned());
    }
    matches.sort_by(|left, right| left.local_address.cmp(&right.local_address).then(left.process_id.cmp(&right.process_id)));
    Ok(matches)
}

#[tauri::command]
pub fn terminate_port_process(port: u16, process_id: u32) -> Result<(), String> {
    if port == 0 || process_id <= 4 {
        return Err("端口或进程标识无效，系统关键进程不会被结束。".to_owned());
    }

    let current_owner = find_port_owners(port)?
        .into_iter()
        .find(|entry| entry.process_id == process_id && is_listening_state(&entry.state))
        .ok_or_else(|| "该进程已不再监听此端口，请重新查询。".to_owned())?;
    let process_name = current_owner.process_name.to_ascii_lowercase();
    let protected_processes = [
        "system", "registry", "system idle process", "smss.exe", "csrss.exe", "wininit.exe",
        "services.exe", "lsass.exe", "winlogon.exe", "svchost.exe",
    ];
    if process_name == "未知进程" || protected_processes.contains(&process_name.as_str()) {
        return Err("无法安全结束此进程；系统关键进程或无法识别的进程受到保护。".to_owned());
    }

    let process_id_text = process_id.to_string();
    let output = run_windows_command("taskkill.exe", &["/PID", &process_id_text])?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() { "结束进程失败，可能需要管理员权限或进程状态已改变。".to_owned() } else { detail });
    }

    Ok(())
}
