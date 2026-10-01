# 安装包、发布与自动更新

公开源码仓库：https://github.com/t000j/local-toolbox

按实际操作顺序发布新版本，请先阅读 [新版本发布教程](HOW_TO_RELEASE.md)。本文件记录技术配置、历史发布和验证边界。

## 技术方案

- 产品名、窗口与快捷方式名称统一为 LocalToolbox，npm 和 Rust 包名为 local-toolbox，主程序为 LocalToolbox.exe；工具名称与操作提示保留中文。
- Windows x64 使用 Tauri 2 + NSIS，安装向导为简体中文，当前用户的新安装默认目录为 `%LOCALAPPDATA%\Programs\LocalToolbox`。
- 0.1.2 接入 Tauri 官方单实例插件，优先注册；重复启动时显示、还原并聚焦已有主窗口。
- 官方 Updater 模块随应用内置，更新文件和 `latest.json` 托管于 GitHub Releases，无业务后端或数据库。
- 正式版本启动 3.5 秒后异步检查一次更新；用户可在“关于与更新”关闭自动检查或手动检查。
- 检测到新版本时显示顶部提示条及侧栏“有更新”标记，点击“查看更新”打开更新说明；“稍后”关闭本次启动对该版本的提示，侧栏入口仍可使用，下一次启动可再次提醒。重新开启自动检查会安排一次检查，关闭则取消等待中的计时。
- 用户下载更新后，应用验证签名；安装需确认，并等待所有已发起的本机工具命令完成。Windows 安装阶段会退出应用，安装程序自动重新启动应用。
- 浏览器预览和 Tauri 开发模式不检查、安装更新。检查失败不会阻止工具使用。
- 应用标识 `cn.localtoolbox.desktop` 应保持稳定，保留同一安装位置和本机用户数据。

默认安装目录由 `src-tauri/windows/installer.nsi` 定制模板指定；模板来源、许可证及升级维护说明见该目录的 README.md。

最初的中文名称“本地工具箱”原型仅用于本机试用。如果仍安装着该原型，请先从 Windows“已安装的应用”卸载旧版，保留应用数据，再安装 LocalToolbox。已安装英文版 LocalToolbox 0.1.0 可使用应用内更新；后续正式版本保持产品名和应用标识稳定。

## 更新密钥

公钥已经写入 `src-tauri/tauri.conf.json`。对应私钥及密码位于开发机 `.secrets/`，该目录已经排除出 Git，并限制为开发机账号与本机执行账号访问。

- `.secrets/updater.key`：带密码保护的签名私钥。
- `.secrets/updater-password.txt`：该私钥的密码。

这两个文件应一起做离线备份，不能提交到仓库或加入安装包。发布后保持签名密钥不变；私钥遗失会影响已安装版本的后续更新。

GitHub Actions 使用两个仓库级 Secrets：

1. `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整内容。
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：对应密码，不能附加多余换行。

2026-09-30 已将这两项配置保存到 `t000j/local-toolbox` 的仓库级 Actions 加密 Secrets，并核对名称与配置时间。私钥与密码未提交到源码仓库；0.1.1 的 GitHub Actions 签名构建与正式发布均已完成。

发布工作流通过 `secrets` 读取这两项签名配置。仓库级 Secrets 可供有权限的工作流引用，因此修改发布工作流时也应审核密钥的使用范围。`GITHUB_TOKEN` 由 GitHub 自动提供，不需要把个人访问令牌写进源码。

## 发布新版本

本仓库推送 `main` 不触发安装包构建；构建仅由 `v*` 标签或手动执行发布工作流触发。

1. 在 GitHub Actions 选择 `Windows installer and updater release`，手动运行。
2. 工作流检查版本一致性，构建 Windows x64 安装包、更新签名和 `latest.json`，创建 Release 草稿。
3. 在 Windows 上验证安装、工具操作、卸载以及从旧版更新。
4. 审核自动生成的更新说明，确认后把草稿发布为正式 Release；若改动客户端更新说明，应同时修改 `latest.json` 中的 `notes`。
5. `releases/latest/download/latest.json` 才会指向这个正式版本，用户启动时可检查到更新。

工作流优先使用 `docs/release-notes/版本号.md` 中的中文更新说明，未提供时才调用 GitHub 自动生成；更新说明应在正式发布前审核。源码推送与安装包正式发布是两个独立步骤。

## 当前已发布版本

- 正式版本：[LocalToolbox 0.1.3](https://github.com/t000j/local-toolbox/releases/tag/v0.1.3)，2026-10-01 发布，包含 97 款内置工具，非草稿、非预发布，并标记为 latest。
- 对应源码标签：v0.1.3，源码提交 cbdf846；[GitHub Actions 构建](https://github.com/t000j/local-toolbox/actions/runs/36810909508) 已成功。
- 发布资产：LocalToolbox_0.1.3_x64-setup.exe（7,788,047 字节，约 7.43 MiB）、对应 .exe.sig、latest.json。
- 已下载草稿安装包核对产品名和版本、字节大小及 GitHub SHA-256；更新清单的 windows-x86_64 / windows-x86_64-nsis 地址与安装包资产一致，signature 与发布的 .sig 文件一致。
- 正式发布后使用不携带 GitHub 凭据的请求核对固定更新入口返回 0.1.3、安装包 HTTP 200 和 SHA-256 一致。公开安装包 SHA-256：1ae93a06d7354c06251eb2a625958ef918bbb7031e1f87411080c9df985f85eb。
- 保持应用标识、产品名称、更新公钥和安装方式；Windows 界面、原生工具操作、安装和从旧版升级仍待用户实机验收。

### 0.1.2 历史发布记录

- 正式版本：[LocalToolbox 0.1.2](https://github.com/t000j/local-toolbox/releases/tag/v0.1.2)，2026-09-30 发布，非草稿、非预发布，并标记为 latest。
- 对应源码标签：v0.1.2；[GitHub Actions 构建](https://github.com/t000j/local-toolbox/actions/runs/36678464242) 已成功。
- 发布资产：LocalToolbox_0.1.2_x64-setup.exe（3,991,574 字节，约 3.81 MiB）、对应 .exe.sig、latest.json。
- 已使用未登录的 HTTP 请求核对固定更新入口返回 0.1.2，以及对应 Windows 安装包可公开下载且产品名/版本正确。
- 官方 tauri-action v1 的清单使用 GitHub 资产 API 下载地址；当前 Updater 插件会自动携带 application/octet-stream 请求头，可下载公开仓库的资产，无需向用户提供 GitHub Token。
- 清单中的 windows-x86_64 与 windows-x86_64-nsis 均指向该版本安装包，签名字段与发布的 .sig 文件一致。

## 0.1.4 本机修复候选（未发布）

- 将检查更新超时从 12 秒提高到 45 秒，提供超时与网络连接失败的中文提示。正式版仍为 0.1.3，当前没有 v0.1.4 标签或 GitHub Release。
- 诊断复用与 0.1.2 相同版本的 reqwest 和更新插件请求设置：12 秒请求约 12.0 秒返回 operation timed out；仅将超时提高到 45 秒后，约 15.9 秒以 HTTP 200 读取公开 0.1.3 清单。
- 0.1.2 / 0.1.3 的超时写在客户端里，服务端更新文件无法修改它。持续超时的用户需要手动运行修复版安装包覆盖安装，保留产品名称、应用标识、更新公钥和本机配置。
- 2026-10-01 已通过发布配置校验、Vue/TypeScript 检查、Vite 构建、Windows x64 Rust release 编译与 NSIS 签名打包，生成 `LocalToolbox_0.1.4_x64-setup.exe`（7,788,214 字节，约 7.43 MiB）和 444 字节的对应 `.sig`，并核对安装包产品名与版本。Vite 和 Rust 既有构建告警保留；实际安装、客户端更新界面和完整升级链路仍待验证。

## 后续版本

```text
npm run release:version -- 0.1.4
```

`release:version` 同步 `package.json`、`package-lock.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 中的应用版本。审核并提交这批版本文件后，创建对应标签（例如 `v0.1.4`）并推送，工作流会建立相应 Release 草稿。标签必须与文件中的版本一致，不复用已经发布的标签。

安装包默认重新下载安装整个 NSIS 包，不是差分更新。发布需要同时保留该版本的安装包、签名和 `latest.json`。

## 从 0.1.2 验证应用内更新到 0.1.3

1. 保留已安装的 LocalToolbox 0.1.2，启动后等待自动检查，或进入“关于与更新”手动检查。
2. 核对新版本为 0.1.3，并显示本次 97 款内置工具的更新说明。
3. 下载后确认安装，等待应用退出、安装完成和重新启动。
4. 核对实际版本为 0.1.3、工具数量为 97、原安装位置和本机设置保留；逐项体验新增工具。
5. 升级到线上最新版后没有新版本提醒属于正常情况。

这些步骤尚待用户实际执行。直接双击新安装包不能替代应用内检查、下载、验签、安装和重启的完整验证。

### 历史升级步骤：0.1.1 → 0.1.2

1. 保留已经安装的英文名称 LocalToolbox 0.1.1，在侧栏打开“关于与更新”，点击“检查更新”（0.1.0 也可更新）。
2. 看到 0.1.2 和单实例/更新提醒的说明后，点击下载，等待进度完成；应用会验证更新签名。
3. 确认没有本机工具任务正在执行后，点击安装并确认。应用退出，安装器完成升级并重新启动应用。
4. 检查实际版本为 0.1.2，全部工具仍为 41 款，安装目录与旧版本一致。
5. 应用保持打开时重复双击图标，再将窗口最小化后重复启动，核对只有原窗口并被还原、唤起；同时检查收藏、文本片段和工作区等设置是否保留。
6. 0.1.2 发布时为线上最新版，没有新版本提醒属于正常情况；现在可检查更高的 0.1.3，验证顶部提醒和“稍后”行为。

测试应用内更新时使用现有旧版的更新入口；直接运行 0.1.2 安装程序可验证覆盖安装，但不会验证应用内检查、下载和验签链路。

## 本机打包

```text
npm ci
npm run release:build
```

本机脚本读取 `.secrets/`，仅在构建子进程中设置签名环境变量，结束后还原。生成文件位于 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。

2026-10-01 已完成 0.1.3 本机打包，生成 `LocalToolbox_0.1.3_x64-setup.exe`（7,790,827 字节，约 7.43 MiB）与对应 `.exe.sig`。GitHub 构建的正式安装包为 7,788,047 字节；两者都使用同一应用标识、产品名、更新公钥和默认安装目录。本机体验时双击安装程序，按中文向导安装；签名文件供更新校验使用。0.1.2 的本机与云端打包记录保留在历史发布说明中。

打包入口兼容 Windows PowerShell 5.1；scripts/ 下直接执行的中文 `.ps1` 文件保留 UTF-8 BOM 和 CRLF。Rust 内置的查询脚本通过 UTF-16 EncodedCommand 执行，源文件使用无 BOM 的 UTF-8 和 LF，避免把 BOM 嵌入命令；仓库 `.editorconfig` 已分别指定。

更新签名用于验证安装包来自该项目，与 Windows Authenticode 发布者签名不同。目前未配置付费的 Windows 发布者证书；SmartScreen 是否提示还取决于 Windows 的签名与信誉判断。

## 文档维护

直接维护项目根目录的 `本地工具箱-产品规划与技术选型.md`，并随本次代码或发布记录提交，不需要文档同步脚本。

## 当前验证边界

0.1.3 已完成发布配置校验、Vue/TypeScript 检查、Vite 生产构建、Windows x64 Rust release 编译、NSIS 签名打包和 GitHub Actions 构建，并核对正式更新入口、匿名安装包下载、版本、大小、SHA-256 及清单签名一致性。本次没有重跑开发阶段的 54 个回归脚本，没有实际安装或运行系统修改。Vite 大块提示和 Rust 未使用导入/重复 FFI 声明告警仍保留；构建通过不等于实机、签名验签或升级链路已验证。

以下为历史版本的验证记录：

0.1.2 已通过完整本机和 GitHub Actions 构建并正式发布单实例与更新提醒优化，工具数量仍为 41。已核对 Windows 平台清单的安装包地址和签名字段一致性，以及公开入口和匿名安装包下载均返回 HTTP 200。该版本使用与 0.1.1 相同的应用标识、签名公钥及安装记录；单实例唤起、提醒显示和实际升级待用户验证。

新版提醒只有在运行 0.1.2 且线上版本更高时显示。0.1.1 检查 0.1.2 时仍使用旧版提示界面；升级到线上最新版后没有新版本提醒属于正常情况。

已核对 Secret 名称与配置时间、本机敏感文件的 Git 忽略规则；打包脚本与新工具脚本的解析检查、本机完整打包和 GitHub Actions 构建均通过。0.1.1 已正式发布，公开更新清单、签名字段一致性及安装包匿名下载已核对；这些检查不等同于已完成客户端下载安装或更新验签的实际运行。

0.1.1 新增设备与驱动清单，当前共 41 款工具。0.1.1 已由用户安装，安装器会记录原安装位置；设备查询的实际返回、单实例窗口行为以及后续升级的完整链路仍需用户实际操作核对。

## 官方参考

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
