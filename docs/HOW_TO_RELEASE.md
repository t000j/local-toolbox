# LocalToolbox 新版本发布教程

这份教程按实际操作顺序编写。当前线上正式版本是 0.1.2，下面以准备发布 0.1.3 为例；以后把版本号替换为新的版本即可。

## 发布流程

```text
完成代码和文档 → 同步版本号 → 编写更新说明 → 本机打包
→ 提交并推送源码 → 推送版本标签 → GitHub Actions 构建
→ 检查 Release 草稿 → 正式发布 → 使用旧版测试更新
```

不需要部署服务器。GitHub Actions 负责签名打包，GitHub Releases 保存安装包、签名和更新清单。

## 1. 进入项目目录并完成开发

在 PowerShell 中进入源码目录：

```powershell
cd E:\codexProject\toolbox-app
git status --short
```

先核对修改范围。工具实现、注册和产品规划应同步；当前工作目录的“本地工具箱-产品规划与技术选型.md”是规划源文档，仓库 docs/PRODUCT_PLAN.md 是它的镜像。

## 2. 同步新的版本号

```powershell
npm run release:version -- 0.1.3
```

该命令同步以下五个文件中的应用版本：

- package.json
- package-lock.json
- src-tauri/tauri.conf.json
- src-tauri/Cargo.toml
- src-tauri/Cargo.lock

使用比已发布版本更高的版本号。不要复用 0.1.2 或已有版本标签，也不要只修改其中一个文件。

产品名 LocalToolbox、应用标识 cn.localtoolbox.desktop 和更新公钥保持稳定，它们关系到原安装位置、本机数据及旧版的更新验证。

## 3. 编写中文更新说明

打开 docs/release-notes/0.1.3.md，写清楚本次新增和修复。工作流会把它用于 GitHub Release 和客户端更新说明。

仓库已经准备了 0.1.3 的设置备份与恢复说明。发布前按实际改动核对，之后新增功能也要补进该文件。下一个版本则新建相应的版本文件。

同步产品规划并检查发布配置：

```powershell
npm run docs:sync
npm run release:check
```

如果提示版本不一致，先解决错误，再继续打包。

## 4. 本机生成安装包

```powershell
npm run release:build
```

如果是新克隆的项目或前端依赖尚未安装，先运行 npm ci。本机打包需要 Node.js、Rust、Windows C++ Build Tools，以及与当前公钥对应的私钥和密码。

本机密钥文件位于：

- .secrets/updater.key
- .secrets/updater-password.txt

这些文件已被 Git 忽略，不提交到仓库。单独克隆源码不会获得它们；GitHub Actions 则使用已经配置的仓库 Secrets，可以独立签名构建。

打包成功后，0.1.3 的本机产物位于：

```text
E:\codexProject\toolbox-app\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\
  LocalToolbox_0.1.3_x64-setup.exe
  LocalToolbox_0.1.3_x64-setup.exe.sig
```

本机打包用于先核对编译和安装包。正式发布流程中的 latest.json 由 GitHub Actions 自动生成，无需自己拼写签名或下载地址。

## 5. 提交并推送版本相关源码

在 Git 客户端中，仅选中本次工具代码、版本文件、产品规划镜像和更新说明，核对差异后提交。保留其他任务的修改，不使用 git add . 混入全部文件；私钥、node_modules、dist 和 target 不进入提交。

也可以直接让 Codex 处理这一阶段，例如：

> 提交并推送本次 0.1.3 的工具实现、版本文件和配套文档到 main，保留其他修改，不推送版本标签。

完成本地提交后，推送源码：

```powershell
git push origin main
```

到 [源码仓库](https://github.com/t000j/local-toolbox) 确认 package.json 中的版本已是 0.1.3，且本次代码和更新说明都在仓库中。只在本机修改版本号、未推送源码，GitHub 会继续使用旧代码。

## 6. 触发 GitHub 签名构建

推荐推送明确的版本标签：

```powershell
git tag -a v0.1.3 -m "LocalToolbox v0.1.3"
git push origin refs/tags/v0.1.3
```

标签必须与上述五个文件的版本一致。标签已经存在时先核对，不覆盖已发布标签。

打开 [GitHub Actions](https://github.com/t000j/local-toolbox/actions)，选择 Windows installer and updater release，查看 v0.1.3 的运行。首次构建需要下载和编译依赖；等待该次运行成功。

也可以在代码已推送后选择该工作流的 Run workflow，使用 main 手动触发。标签推送和手动触发选择一种即可，同一版本不重复执行。

Actions 会使用已有的 TAURI_SIGNING_PRIVATE_KEY 和 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 两项 Secrets，不需要每次重新填写。

## 7. 检查草稿并正式发布

打开 [Releases](https://github.com/t000j/local-toolbox/releases)，找到 LocalToolbox v0.1.3 草稿，核对：

1. 标签是 v0.1.3，更新说明与本次功能一致。
2. Assets 中有 LocalToolbox_0.1.3_x64-setup.exe。
3. 有对应的 LocalToolbox_0.1.3_x64-setup.exe.sig。
4. 有 latest.json，version 为 0.1.3，Windows 平台条目指向本次安装包且包含 signature。

如果构建失败或资产缺失，先打开失败步骤的日志处理，不发布缺少更新文件的草稿。

编辑该草稿，正式版本不勾选 This is a pre-release，勾选 Set as latest release，然后点击 Publish release。草稿只有仓库管理者可见；正式发布后旧客户端才能读取这些更新资产。[GitHub 发布说明](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

发布完成后打开固定更新入口，确认 version 已变为 0.1.3：

[latest.json](https://github.com/t000j/local-toolbox/releases/latest/download/latest.json)

清单中的安装包地址可能是 GitHub 资产 API URL，这是当前官方工作流的正常输出。应用下载时会发送 application/octet-stream 请求头，公开仓库的用户无需 GitHub 登录或 Token。

## 8. 使用旧版测试应用内更新

保留已安装的 LocalToolbox 0.1.2，用它测试：

1. 启动后保持“启动后自动检查更新”开启，等待检查；也可点击“关于与更新 → 检查更新”。
2. 核对新版本 0.1.3、顶部提醒和中文更新说明。
3. 选择下载，等待完成后确认安装。
4. 应用重启后核对版本是 0.1.3，安装目录与旧版相同。
5. 核对原有收藏、文本片段、工作区等数据保留，并操作本次新增工具。

从旧应用内更新，才能覆盖检查、下载、验签、安装和重启的完整链路。直接双击新安装包只验证安装器，不能代表应用内更新已验证。

升级到当前线上最新版后不再出现新版本提醒，这是正常情况。点击“稍后”只关闭本次启动的版本提示，侧栏更新入口仍可使用。

## 9. 同步发布记录

发布和用户验证完成后，更新 README、产品规划和 docs/RELEASING.md 中的版本、Release 链接及实际验证结果，然后运行 npm run docs:sync。文档记录单独提交并推送 main，不需要重新触发已发布版本的构建。

不能把“构建通过”写成“升级已验证”。分别记录本机打包、GitHub 构建、公开下载和客户端实际操作的结果。

## 常见情况

| 情况 | 处理方式 |
| --- | --- |
| 只推送 main，没有出现构建 | 正常；再推送对应版本标签，或手动触发发布工作流 |
| 提示标签与版本不一致 | 用 release:version 同步五个文件，再使用对应的 v 标签 |
| Actions 仍构建旧版 | 检查版本和代码是否已经提交并推送到 GitHub |
| Release 已生成，客户端却找不到更新 | 检查它是否仍为草稿、是否为预发布、是否标记为 latest，以及 latest.json 的 version |
| 签名配置缺失 | 检查两项仓库 Secrets；保留现有公钥对应的签名私钥 |
| 旧版已经升级到最新，没有提示条 | 正常；只有线上版本更高时才显示更新提醒 |
| 同版本已经正式发布 | 使用新的更高版本，不覆盖该版本标签或安装资产 |

安装方式、密钥和已发布记录的详细说明见 [发布与更新指南](RELEASING.md)。
