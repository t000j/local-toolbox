# Windows 安装模板

`installer.nsi` 基于本项目当前使用的 Tauri CLI 2.12.0 官方模板，仅为当前用户安装模式调整默认目录：

- 官方默认值：$LOCALAPPDATA\${PRODUCTNAME}
- 项目默认值：$LOCALAPPDATA\Programs\${PRODUCTNAME}

产品名为 LocalToolbox，新安装默认目录为 `%LOCALAPPDATA%\Programs\LocalToolbox`。模板继续保留用户指定的安装目录、恢复已有安装位置、WebView2 检测、卸载和更新行为。

上游来源：[Tauri CLI v2.12.0 installer.nsi](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.0/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)。

原始模板 SHA256：DABED59013B1D78B879A1A85BC7F2EED2993B33A9A90CDABE5946DE3D3950597。

此模板采用上游 MIT 许可证，完整授权与版权声明见 LICENSE-TAURI.txt。升级 Tauri CLI 时，应对照相应版本的官方模板合并安装器修复，并重新保留上述目录调整。
