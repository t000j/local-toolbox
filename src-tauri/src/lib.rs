mod file_rename;
mod disk_tools;
mod image_conversion;
mod network;
mod network_probe;
mod lan_discovery;
mod http_request;
mod process_viewer;
mod service_manager;
mod startup_manager;
mod environment_manager;
mod local_reports;
mod native_windows;
mod screenshot;
mod settings_backup;
mod system;
mod temp_cleanup;
mod workspace_launch;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            file_rename::preview_batch_rename,
            file_rename::rename_batch_files,
            file_rename::undo_batch_rename,
            image_conversion::inspect_image_file,
            image_conversion::convert_image_file,
            image_conversion::preview_image_compression,
            image_conversion::compress_image_file,
            lan_discovery::run_lan_discovery,
            http_request::run_http_request,
            process_viewer::run_process_snapshot,
            service_manager::run_service_manager,
            startup_manager::run_startup_manager,
            environment_manager::run_environment_manager,
            network_probe::prepare_network_probe,
            network_probe::run_dns_query,
            network_probe::run_dns_cache,
            network_probe::run_tcp_snapshot,
            network_probe::run_ping,
            network_probe::run_traceroute,
            network_probe::cancel_network_probe,
            network::get_network_info,
            network::find_port_owners,
            network::terminate_port_process,
            native_windows::list_desktop_windows,
            native_windows::control_desktop_window,
            native_windows::list_installed_apps,
            native_windows::query_event_logs,
            native_windows::get_battery_power,
            native_windows::inspect_file_permissions,
            native_windows::list_local_certificates,
            native_windows::list_device_drivers,
            local_reports::export_battery_report,
            local_reports::collect_diagnostic_report,
            local_reports::save_local_report,
            settings_backup::read_settings_backup,
            settings_backup::save_settings_backup,
            workspace_launch::launch_workspace,
            disk_tools::list_disk_volumes,
            disk_tools::analyze_disk_space,
            temp_cleanup::preview_temp_cleanup,
            temp_cleanup::execute_temp_cleanup,
            screenshot::save_annotated_png,
            screenshot::save_screenshot_png,
            system::get_system_overview
        ])
        .run(tauri::generate_context!())
        .expect("error while running the local toolbox");
}
