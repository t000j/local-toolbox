use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorRow {
    name: String, x: i32, y: i32, width: u32, height: u32, scale: f64, primary: bool,
}
#[derive(Serialize)]
pub struct MonitorSnapshot { monitors: Vec<MonitorRow>, limited: bool }

/// Read only the windowing system's connected-monitor snapshot; no display changes.
#[tauri::command]
pub fn read_monitor_info(window: tauri::Window) -> Result<MonitorSnapshot, String> {
    let primary = window.primary_monitor().map_err(|_| "无法读取主显示器。")?;
    let all = window.available_monitors().map_err(|_| "无法读取显示器信息。")?;
    let limited = all.len() > 32;
    let monitors = all.into_iter().take(32).map(|m| {
        let p = m.position(); let s = m.size();
        let is_primary = primary.as_ref().is_some_and(|v| v.position() == p && v.size() == s);
        MonitorRow { name: m.name().cloned().unwrap_or_else(|| "未命名显示器".into()),
            x: p.x, y: p.y, width: s.width, height: s.height, scale: m.scale_factor(), primary: is_primary }
    }).collect();
    Ok(MonitorSnapshot { monitors, limited })
}
