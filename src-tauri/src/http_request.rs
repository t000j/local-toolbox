use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Deserialize, Serialize)]
pub struct RequestHeader { name: String, value: String }
#[derive(Deserialize, Serialize)]
pub struct HttpRequest { url: String, method: String, headers: Vec<RequestHeader>, body: String }

fn validate(request: &HttpRequest) -> Result<(), String> {
    let invalid = || "请求参数无效；检查 HTTP(S) 地址、方法、请求头和大小限制。".to_owned();
    let authority = request.url.strip_prefix("https://").or_else(|| request.url.strip_prefix("http://"))
        .ok_or_else(invalid)?.split('/').next().unwrap_or("").split('?').next().unwrap_or("");
    if request.url.len() > 4096 || authority.is_empty() || authority.contains('@')
        || !request.url.is_ascii() || request.url.bytes().any(|b| b <= 32 || b == 127)
        || request.url.contains(['#', '\\']) { return Err(invalid()); }
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].contains(&request.method.as_str())
        || request.body.len() > 64 * 1024 || request.headers.len() > 32
        || (["GET", "HEAD"].contains(&request.method.as_str()) && !request.body.is_empty()) { return Err(invalid()); }
    let mut size = 0;
    let mut names = std::collections::HashSet::new();
    for header in &request.headers {
        let name = header.name.to_ascii_lowercase();
        size += header.name.len() + header.value.len();
        if header.name.is_empty() || header.name.len() > 100 || !header.name.bytes().all(|b| {
            b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b)
        }) || header.value.bytes().any(|b| b < 32 || b == 127) || !header.value.is_ascii()
            || !names.insert(name.clone()) || ["host", "content-length", "transfer-encoding", "connection", "expect", "proxy-authorization", "upgrade"].contains(&name.as_str())
        { return Err(invalid()); }
    }
    if size > 8192 { return Err(invalid()); }
    Ok(())
}

#[tauri::command]
pub async fn run_http_request(job_id: String, request: HttpRequest, confirmed: bool) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        validate(&request)?;
        if !confirmed { return Err("请先确认请求地址与发送内容。".to_owned()); }
        let value = serde_json::to_value(request).map_err(|_| "无法准备请求。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/http_request.ps1"), &value, started, Duration::from_secs(20))
    }).await.map_err(|_| "HTTP 工作线程异常结束。".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(url: &str) -> HttpRequest {
        HttpRequest { url: url.to_owned(), method: "GET".to_owned(), headers: vec![], body: String::new() }
    }
    #[test]
    fn validates_protocol_credentials_and_headers() {
        assert!(validate(&request("https://example.invalid/a?b=c")).is_ok());
        for url in ["file:///x", "https://user:secret@example.invalid", "https://x/#fragment", "https://x/\n", "http://", "http://x\\y"] {
            assert!(validate(&request(url)).is_err());
        }
        let mut r = request("http://127.0.0.1:8080/");
        r.headers.push(RequestHeader { name: "Host".to_owned(), value: "other".to_owned() });
        assert!(validate(&r).is_err());
        r.headers[0].name = "X-Test".to_owned();
        assert!(validate(&r).is_ok());
        r.headers[0].value = "bad\r\nHeader: value".to_owned();
        assert!(validate(&r).is_err());
        r.headers.clear(); r.body = "body".to_owned();
        assert!(validate(&r).is_err());
        r.method = "POST".to_owned(); assert!(validate(&r).is_ok());
        r.body = "x".repeat(65537); assert!(validate(&r).is_err());
    }
}
