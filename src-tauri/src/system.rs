use serde::Serialize;
use sysinfo::{CpuRefreshKind, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemOverview {
    os_name: String,
    os_version: String,
    host_name: String,
    cpu_brand: String,
    architecture: String,
    logical_core_count: usize,
    physical_core_count: Option<usize>,
    total_memory_bytes: u64,
    used_memory_bytes: u64,
    uptime_seconds: u64,
}

#[tauri::command]
pub fn get_system_overview() -> SystemOverview {
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_cpu_specifics(CpuRefreshKind::everything().without_cpu_usage());

    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_owned())
        .filter(|brand| !brand.is_empty())
        .unwrap_or_else(|| "未知处理器".to_owned());
    let logical_core_count = system.cpus().len().max(
        std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(1),
    );

    SystemOverview {
        os_name: System::name().unwrap_or_else(|| "Windows".to_owned()),
        os_version: System::long_os_version()
            .or_else(System::os_version)
            .unwrap_or_else(|| "版本信息不可用".to_owned()),
        host_name: System::host_name().unwrap_or_else(|| "未知设备".to_owned()),
        cpu_brand,
        architecture: System::cpu_arch(),
        logical_core_count,
        physical_core_count: System::physical_core_count(),
        total_memory_bytes: system.total_memory(),
        used_memory_bytes: system.used_memory(),
        uptime_seconds: System::uptime(),
    }
}
