use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use std::net::Ipv4Addr;
use std::time::{Duration, Instant};

fn validate_cidr(cidr: &str) -> Result<(), String> {
    let (address, prefix) = cidr.split_once('/').ok_or("请输入 IPv4 网段，例如 192.168.1.0/26。")?;
    let address: Ipv4Addr = address.parse().map_err(|_| "IPv4 地址无效。")?;
    let prefix: u32 = prefix.parse().map_err(|_| "网段前缀无效。")?;
    if !address.is_private() || !(26..=30).contains(&prefix) {
        return Err("仅支持 RFC1918 私有 IPv4 /26–/30 网段（最多 62 个地址）。".to_owned());
    }
    if u32::from(address) & ((1_u32 << (32 - prefix)) - 1) != 0 {
        return Err("请输入网段起始地址，不是单台设备地址。".to_owned());
    }
    Ok(())
}

#[tauri::command]
pub async fn run_lan_discovery(job_id: String, cidr: String, confirmed: bool) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        validate_cidr(&cidr)?;
        if !confirmed { return Err("请确认你有权探测该本地网段。".to_owned()); }
        execute_script(&lease, include_str!("native_scripts/lan_discovery.ps1"),
            &serde_json::json!({ "cidr": cidr }), started, Duration::from_secs(40))
    }).await.map_err(|_| "本地发现工作线程异常结束。".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_private_networks_only() {
        for cidr in ["192.168.1.0/26", "10.0.0.0/30", "172.16.0.64/27", "172.31.255.252/30"] {
            assert!(validate_cidr(cidr).is_ok());
        }
        for cidr in ["192.168.1.1/26", "10.0.0.0/8", "127.0.0.0/26", "169.254.1.0/26", "192.0.2.0/26", "172.32.0.0/26", "10.0.0.0/31", "10.0.0.0/32", "10.0.0.0/0", "10.0.0.0/99", "10.0.0.0/26;foo", "::1/26"] {
            assert!(validate_cidr(cidr).is_err(), "{cidr}");
        }
    }
}
