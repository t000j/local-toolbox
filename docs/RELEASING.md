# 安装包、发布与自动更新

公开源码仓库：https://github.com/t000j/local-toolbox

## 技术方案

- 产品名、窗口与快捷方式名称统一为 LocalToolbox，npm 和 Rust 包名为 local-toolbox，主程序为 LocalToolbox.exe；工具名称与操作提示保留中文。
- Windows x64 使用 Tauri 2 + NSIS，安装向导为简体中文，当前用户的新安装默认目录为 `%LOCALAPPDATA%\Programs\LocalToolbox`。
- 官方 Updater 模块随应用内置，更新文件和 `latest.json` 托管于 GitHub Releases，无业务后端或数据库。
- 正式版本启动 3.5 秒后异步检查一次更新；用户可在“关于与更新”关闭自动检查或手动检查。
- 用户下载更新后，应用验证签名；安装需确认，并等待所有已发起的本机工具命令完成。Windows 安装阶段会退出应用，安装程序自动重新启动应用。
- 浏览器预览和 Tauri 开发模式不检查、安装更新。检查失败不会阻止工具使用。
- 应用标识 `cn.localtoolbox.desktop` 应保持稳定，保留同一安装位置和本机用户数据。

默认安装目录由 `src-tauri/windows/installer.nsi` 定制模板指定；模板来源、许可证及升级维护说明见该目录的 README.md。

首版尚未公开发布。如果本机已安装中文名称“本地工具箱”的原型，请先从 Windows“已安装的应用”卸载旧版，保留应用数据，再安装 LocalToolbox。名称调整不会自动移动旧目录；后续正式版本应保持产品名和应用标识稳定。

## 更新密钥

公钥已经写入 `src-tauri/tauri.conf.json`。对应私钥及密码位于开发机 `.secrets/`，该目录已经排除出 Git，并限制为开发机账号与本机执行账号访问。

- `.secrets/updater.key`：带密码保护的签名私钥。
- `.secrets/updater-password.txt`：该私钥的密码。

这两个文件应一起做离线备份，不能提交到仓库或加入安装包。发布后保持签名密钥不变；私钥遗失会影响已安装版本的后续更新。

GitHub Actions 使用两个仓库级 Secrets：

1. `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整内容。
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：对应密码，不能附加多余换行。

2026-09-30 已将这两项配置保存到 `t000j/local-toolbox` 的仓库级 Actions 加密 Secrets，并核对名称与配置时间。私钥与密码未提交到源码仓库；本机已生成签名安装包，尚未执行 Actions 构建或正式发布。

发布工作流通过 `secrets` 读取这两项签名配置。仓库级 Secrets 可供有权限的工作流引用，因此修改发布工作流时也应审核密钥的使用范围。`GITHUB_TOKEN` 由 GitHub 自动提供，不需要把个人访问令牌写进源码。

## 首次发布

本仓库推送 `main` 不触发安装包构建；构建仅由 `v*` 标签或手动执行发布工作流触发。

1. 在 GitHub Actions 选择 `Windows installer and updater release`，手动运行。
2. 工作流检查版本一致性，构建 Windows x64 安装包、更新签名和 `latest.json`，创建 Release 草稿。
3. 在 Windows 上验证安装、工具操作、卸载以及从旧版更新。
4. 审核自动生成的更新说明，确认后把草稿发布为正式 Release；若改动客户端更新说明，应同时修改 `latest.json` 中的 `notes`。
5. `releases/latest/download/latest.json` 才会指向这个正式版本，用户启动时可检查到更新。

工作流优先使用 `docs/release-notes/版本号.md` 中的中文更新说明，未提供时才调用 GitHub 自动生成；更新说明应在正式发布前审核。源码推送与安装包正式发布是两个独立步骤。

## 后续版本

```text
npm run release:version -- 0.1.1
npm run docs:sync
```

`release:version` 同步 `package.json`、`package-lock.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 中的应用版本。审核并提交这批版本文件后，创建 `v0.1.1` 标签并推送，工作流会建立相应 Release 草稿。标签必须与文件中的版本一致。

安装包默认重新下载安装整个 NSIS 包，不是差分更新。发布需要同时保留该版本的安装包、签名和 `latest.json`。

## 本机打包

```text
npm ci
npm run release:build
```

本机脚本读取 `.secrets/`，仅在构建子进程中设置签名环境变量，结束后还原。生成文件位于 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。

2026-09-30 已完成 0.1.1 本机打包，生成 `LocalToolbox_0.1.1_x64-setup.exe`（约 3.80 MiB）与对应 `.exe.sig`，并核对生成的 NSIS 脚本中的产品名、主程序名和默认安装目录。本机体验时双击安装程序，按中文向导安装；签名文件供更新校验使用。

打包入口兼容 Windows PowerShell 5.1；含中文的 `.ps1` 文件必须保留 UTF-8 BOM，避免被按系统 ANSI 编码误读。仓库 `.editorconfig` 已指定该编码和 CRLF 换行。

更新签名用于验证安装包来自该项目，与 Windows Authenticode 发布者签名不同。目前未配置付费的 Windows 发布者证书；SmartScreen 是否提示还取决于 Windows 的签名与信誉判断。

## 文档同步

当前工作目录的 `本地工具箱-产品规划与技术选型.md` 是产品规划源文档；执行 `npm run docs:sync` 复制为仓库中的 `docs/PRODUCT_PLAN.md`。单独克隆仓库时直接阅读镜像。

## 当前验证边界

此次已接入仓库、依赖、工作流和更新代码，并配置签名 Secrets。已核对 Secret 名称与配置时间、本机敏感文件的 Git 忽略规则；打包脚本已通过 Windows PowerShell 5.1 和 PowerShell 7 解析检查，`npm run build` 与 `npm run release:build` 均成功，生成 Windows x64 安装包和更新签名。尚未实际安装、运行工具或完成版本升级，也未触发 Actions 或正式发布；正式发布前应完成这些验证。

0.1.1 新增设备与驱动清单，已通过 Windows PowerShell 5.1 脚本解析及完整本机打包；本次准备发布更新供已安装 LocalToolbox 0.1.0 的用户验证。设备查询的实际返回与 0.1.0 → 0.1.1 的下载安装仍待用户实际操作。

## 官方参考

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
