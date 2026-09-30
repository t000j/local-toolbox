use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRule {
    mode: RenameMode,
    prefix: String,
    suffix: String,
    find: String,
    replace: String,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum RenameMode {
    PrefixSuffix,
    Replace,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenamePreview {
    old_path: String,
    new_path: String,
    old_name: String,
    new_name: String,
    size_bytes: u64,
    status: String,
    reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenameRecord {
    old_path: String,
    new_path: String,
}

fn folded_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn valid_windows_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." {
        return Err("新文件名不能为空".to_owned());
    }
    if name.chars().any(|character| character < ' ' || "<>:\"/\\|?*".contains(character)) {
        return Err("文件名包含 Windows 不允许的字符".to_owned());
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err("文件名不能以空格或句点结尾".to_owned());
    }
    let device_name = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let reserved = matches!(device_name.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        || ["COM", "LPT"].iter().any(|prefix| {
            device_name.strip_prefix(prefix).is_some_and(|number| matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"))
        });
    if reserved {
        return Err("文件名与 Windows 设备名称冲突".to_owned());
    }
    Ok(())
}

fn transformed_stem(stem: &str, rule: &RenameRule) -> Result<String, String> {
    match rule.mode {
        RenameMode::PrefixSuffix if rule.prefix.is_empty() && rule.suffix.is_empty() => Err("请至少输入一个前缀或后缀".to_owned()),
        RenameMode::PrefixSuffix => Ok(format!("{}{stem}{}", rule.prefix, rule.suffix)),
        RenameMode::Replace if rule.find.is_empty() => Err("请输入要查找的文件名内容".to_owned()),
        RenameMode::Replace => Ok(stem.replace(&rule.find, &rule.replace)),
    }
}

fn make_preview(path_text: &str, rule: &RenameRule) -> RenamePreview {
    let path = PathBuf::from(path_text);
    let old_name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default().to_owned();
    let mut preview = RenamePreview {
        old_path: path_text.to_owned(),
        new_path: String::new(),
        old_name: old_name.clone(),
        new_name: old_name,
        size_bytes: 0,
        status: "invalid".to_owned(),
        reason: None,
    };

    let fail = |preview: &mut RenamePreview, reason: String| {
        preview.reason = Some(reason);
    };
    if !path.is_absolute() {
        fail(&mut preview, "文件路径不是绝对路径".to_owned());
        return preview;
    }
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => {
            fail(&mut preview, "只支持重命名普通文件，不支持目录或符号链接".to_owned());
            return preview;
        }
        Err(error) => {
            fail(&mut preview, format!("无法读取文件：{error}"));
            return preview;
        }
    };
    preview.size_bytes = metadata.len();

    let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
        fail(&mut preview, "无法读取文件名".to_owned());
        return preview;
    };
    let Some(parent) = path.parent() else {
        fail(&mut preview, "无法读取文件所在目录".to_owned());
        return preview;
    };
    let new_stem = match transformed_stem(stem, rule) {
        Ok(value) => value,
        Err(reason) => {
            fail(&mut preview, reason);
            return preview;
        }
    };
    let extension = path.extension().and_then(|value| value.to_str());
    let new_name = match extension {
        Some(extension) => format!("{new_stem}.{extension}"),
        None => new_stem,
    };
    if let Err(reason) = valid_windows_name(&new_name) {
        fail(&mut preview, reason);
        return preview;
    }
    let target = parent.join(&new_name);
    preview.new_name = new_name;
    preview.new_path = target.to_string_lossy().into_owned();
    if folded_path(&path) == folded_path(&target) {
        preview.status = "unchanged".to_owned();
    } else if target.exists() {
        preview.status = "conflict".to_owned();
        preview.reason = Some("目标文件名已存在".to_owned());
    } else {
        preview.status = "ready".to_owned();
    }
    preview
}

fn build_previews(paths: &[String], rule: &RenameRule) -> Result<Vec<RenamePreview>, String> {
    if paths.is_empty() {
        return Err("请先选择要重命名的文件".to_owned());
    }
    if paths.len() > 200 {
        return Err("一次最多处理 200 个文件".to_owned());
    }
    let mut selected = HashSet::new();
    for path in paths {
        if !selected.insert(folded_path(Path::new(path))) {
            return Err("选择列表中存在重复文件".to_owned());
        }
    }

    let mut previews: Vec<RenamePreview> = paths.iter().map(|path| make_preview(path, rule)).collect();
    let mut targets = std::collections::HashMap::<String, Vec<usize>>::new();
    for (index, preview) in previews.iter().enumerate() {
        if preview.status == "ready" {
            targets.entry(folded_path(Path::new(&preview.new_path))).or_default().push(index);
        }
    }
    for indexes in targets.values().filter(|indexes| indexes.len() > 1) {
        for index in indexes {
            previews[*index].status = "conflict".to_owned();
            previews[*index].reason = Some("多个文件将得到相同的新名称".to_owned());
        }
    }
    Ok(previews)
}

fn validate_records(records: &[RenameRecord]) -> Result<(), String> {
    if records.is_empty() || records.len() > 200 {
        return Err("没有可执行的重命名记录，或文件数量超出限制".to_owned());
    }
    let mut sources = HashSet::new();
    let mut targets = HashSet::new();
    for record in records {
        let source = Path::new(&record.old_path);
        let target = Path::new(&record.new_path);
        if !source.is_absolute() || !target.is_absolute() || source.parent() != target.parent() {
            return Err("重命名仅允许在原目录内修改文件名".to_owned());
        }
        if !sources.insert(folded_path(source)) || !targets.insert(folded_path(target)) {
            return Err("重命名记录中存在重复路径".to_owned());
        }
        let source_metadata = fs::symlink_metadata(source).map_err(|error| format!("源文件已不存在或无法读取：{error}"))?;
        if !source_metadata.is_file() {
            return Err("只支持重命名普通文件".to_owned());
        }
        if target.exists() {
            return Err(format!("目标文件名已存在：{}", target.file_name().and_then(|name| name.to_str()).unwrap_or_default()));
        }
        let target_name = target.file_name().and_then(|name| name.to_str()).ok_or("目标文件名无效")?;
        valid_windows_name(target_name)?;
    }
    Ok(())
}

fn execute_records(records: &[RenameRecord]) -> Result<(), String> {
    validate_records(records)?;
    let mut completed: Vec<RenameRecord> = Vec::new();
    for record in records {
        if let Err(error) = fs::rename(&record.old_path, &record.new_path) {
            for completed_record in completed.iter().rev() {
                let _ = fs::rename(&completed_record.new_path, &completed_record.old_path);
            }
            return Err(format!("文件改名失败：{error}；已尝试撤销本批次已完成的改名。"));
        }
        completed.push(record.clone());
    }
    Ok(())
}

#[tauri::command]
pub fn preview_batch_rename(paths: Vec<String>, rule: RenameRule) -> Result<Vec<RenamePreview>, String> {
    build_previews(&paths, &rule)
}

#[tauri::command]
pub fn rename_batch_files(paths: Vec<String>, rule: RenameRule) -> Result<Vec<RenameRecord>, String> {
    let previews = build_previews(&paths, &rule)?;
    if let Some(blocked) = previews.iter().find(|preview| preview.status != "ready" && preview.status != "unchanged") {
        return Err(blocked.reason.clone().unwrap_or_else(|| "存在无法执行的文件名".to_owned()));
    }
    let records: Vec<RenameRecord> = previews
        .into_iter()
        .filter(|preview| preview.status == "ready")
        .map(|preview| RenameRecord { old_path: preview.old_path, new_path: preview.new_path })
        .collect();
    execute_records(&records)?;
    Ok(records)
}

#[tauri::command]
pub fn undo_batch_rename(records: Vec<RenameRecord>) -> Result<(), String> {
    let reversed: Vec<RenameRecord> = records
        .iter()
        .rev()
        .map(|record| RenameRecord { old_path: record.new_path.clone(), new_path: record.old_path.clone() })
        .collect();
    execute_records(&reversed)
}
