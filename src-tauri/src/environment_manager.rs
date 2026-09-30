use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use crate::service_manager::SYSTEM_CHANGE_LOCK;
use serde::Deserialize;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentRequest {
    action: String, name: String, expected: String, confirmed: bool,
    #[serde(default)] value: String, #[serde(default)] kind: String,
    #[serde(default)] new_value: String, #[serde(default)] scope: String,
}
fn valid_value(value: &str) -> bool {
    value.encode_utf16().count() <= 8192 && !value.contains('\0')
}
fn validate(request: &EnvironmentRequest) -> Result<(), String> {
    let valid = if request.action == "list" {
        !request.confirmed && request.name.is_empty() && request.expected.is_empty()
            && request.value.is_empty() && request.new_value.is_empty() && request.kind.is_empty() && request.scope.is_empty()
    } else {
        let name = request.name.as_bytes();
        request.confirmed && request.scope == "用户 HKCU Environment"
            && !name.is_empty() && name.len() <= 256
            && (name[0].is_ascii_alphabetic() || name[0] == b'_')
            && name.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
            && ["String", "ExpandString"].contains(&request.kind.as_str())
            && valid_value(&request.value) && valid_value(&request.new_value)
            && match request.action.as_str() {
                "add" => request.expected == "absent" && request.value.is_empty(),
                "edit" => request.expected == "present" && request.value != request.new_value,
                "delete" => request.expected == "present" && request.new_value.is_empty(),
                _ => false,
            }
    };
    if valid { Ok(()) } else { Err("环境变量参数无效；仅可预览确认后新增、修改或删除普通用户字符串变量。".into()) }
}
#[tauri::command]
pub async fn run_environment_manager(job_id: String, request: EnvironmentRequest) -> Result<ProbeExecution, String> {
    // Consume the reservation even for invalid requests; the script independently
    // enforces sensitive/protected-name policy before reading any target value.
    let lease = acquire_job(&job_id)?;
    validate(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/environment_manager.ps1"),
            &serde_json::json!({"action":request.action,"name":request.name,"value":request.value,
                "newValue":request.new_value,"kind":request.kind,"confirmed":request.confirmed,
                "scope":request.scope,"expected":request.expected}), Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "环境变量任务异常结束；请重新读取，勿直接重试。".to_owned())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn change(action: &str) -> EnvironmentRequest {
        EnvironmentRequest { action: action.into(), name: "TOOLBOX_EXAMPLE".into(),
            expected: if action == "add" { "absent" } else { "present" }.into(), confirmed: true,
            value: if action == "add" { "" } else { "old" }.into(), kind: "String".into(),
            new_value: if action == "delete" { "" } else { "new" }.into(), scope: "用户 HKCU Environment".into() }
    }
    #[test]
    fn validates_explicit_user_mutations_and_empty_string_values() {
        for action in ["add", "edit", "delete"] { assert!(validate(&change(action)).is_ok()); }
        let mut r = change("edit"); r.new_value.clear(); assert!(validate(&r).is_ok());
        r = change("add"); r.new_value.clear(); r.kind = "ExpandString".into(); assert!(validate(&r).is_ok());
    }
    #[test]
    fn rejects_ambiguous_or_unconfirmed_mutations() {
        for action in ["rename", "set", "execute", ""] { assert!(validate(&change(action)).is_err()); }
        let mut r = change("delete"); r.confirmed = false; assert!(validate(&r).is_err());
        r = change("add"); r.expected = "present".into(); assert!(validate(&r).is_err());
        r = change("edit"); r.expected = "absent".into(); assert!(validate(&r).is_err());
        r = change("delete"); r.new_value = "new".into(); assert!(validate(&r).is_err());
        r = change("add"); r.value = "old".into(); assert!(validate(&r).is_err());
        r = change("edit"); r.new_value = r.value.clone(); assert!(validate(&r).is_err());
        r = change("add"); r.scope = "系统 HKLM Environment（只读）".into(); assert!(validate(&r).is_err());
        r = change("edit"); r.kind = "DWord".into(); assert!(validate(&r).is_err());
        for name in ["", "1NAME", "A=B", "A B", "A\nB", "变量"] {
            r = change("add"); r.name = name.into(); assert!(validate(&r).is_err());
        }
    }
    #[test]
    fn validates_utf16_value_budget_without_expanding_or_trimming() {
        let mut r = change("add"); r.new_value = "😀".repeat(4096); assert!(validate(&r).is_ok());
        r.new_value.push('x'); assert!(validate(&r).is_err());
        r.new_value = "x\0y".into(); assert!(validate(&r).is_err());
        r.new_value = "  %PATH% ; $x \n".into(); assert!(validate(&r).is_ok());
    }
}
