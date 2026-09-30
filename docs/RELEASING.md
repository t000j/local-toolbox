# 安装包、发布与自动更新

公开源码仓库：https://github.com/t000j/local-toolbox

## 技术方案

- Windows x64 使用 Tauri 2 + NSIS，安装向导为简体中文，默认安装到当前用户。
- 官方 Updater 模块随应用内置，更新文件和 `latest.json` 托管于 GitHub Releases，无业务后端或数据库。
- 正式版本启动 3.5 秒后异步检查一次更新；用户可在“关于与更新”关闭自动检查或手动检查。
- 用户下载更新后，应用验证签名；安装需确认，并等待所有已发起的本机工具命令完成。Windows 安装阶段会退出应用，安装程序自动重新启动应用。
- 浏览器预览和 Tauri 开发模式不检查、安装更新。检查失败不会阻止工具使用。
- 应用标识 `cn.localtoolbox.desktop` 应保持稳定，保留同一安装位置和本机用户数据。

## 更新密钥

公钥已经写入 `src-tauri/tauri.conf.json`。对应私钥及密码位于开发机 `.secrets/`，该目录已经排除出 Git，并限制为当前 Windows 用户访问。

- `.secrets/updater.key`：带密码保护的签名私钥。
- `.secrets/updater-password.txt`：该私钥的密码。

这两个文件应一起做离线备份，不能提交到仓库或加入安装包。发布后保持签名密钥不变；私钥遗失会影响已安装版本的后续更新。

GitHub Actions 使用两个仓库级 Secrets：

1. `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整内容。
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：对应密码，不能附加多余换行。

目前这两项 Secrets 尚未上传。自动审批要求用户明确授权将对应私钥与密码存入 `t000j/local-toolbox` 仓库的 Actions 加密 Secrets；源码仓库与更新接入代码可先推送，签名构建需在授权并配置 Secrets 后才能运行。

只有发布工作流可访问 Secrets。`GITHUB_TOKEN` 由 GitHub 自动提供，不需要把个人访问令牌写进源码。

## 首次发布

本仓库推送 `main` 不触发安装包构建；构建仅由 `v*` 标签或手动执行发布工作流触发。

1. 在 GitHub Actions 选择 `Windows installer and updater release`，手动运行。
2. 工作流检查版本一致性，构建 Windows x64 安装包、更新签名和 `latest.json`，创建 Release 草稿。
3. 在 Windows 上验证安装、工具操作、卸载以及从旧版更新。
4. 审核自动生成的更新说明，确认后把草稿发布为正式 Release；若改动客户端更新说明，应同时修改 `latest.json` 中的 `notes`。
5. `releases/latest/download/latest.json` 才会指向这个正式版本，用户启动时可检查到更新。

自动生成的更新说明应在正式发布前审核。源码推送与安装包正式发布是两个独立步骤。

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

更新签名用于验证安装包来自该项目，与 Windows Authenticode 发布者签名不同。目前未配置付费的 Windows 发布者证书；SmartScreen 是否提示还取决于 Windows 的签名与信誉判断。

## 文档同步

当前工作目录的 `本地工具箱-产品规划与技术选型.md` 是产品规划源文档；执行 `npm run docs:sync` 复制为仓库中的 `docs/PRODUCT_PLAN.md`。单独克隆仓库时直接阅读镜像。

## 当前验证边界

此次只接入仓库、依赖、工作流和更新代码。按用户既有要求，尚未编译、运行应用、构建安装包或实际完成版本升级。正式发布前应完成这些验证。

## 官方参考

- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
