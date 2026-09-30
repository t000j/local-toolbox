import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
const pkg = json('package.json')
const config = json('src-tauri/tauri.conf.json')
const npmLock = json('package-lock.json')
const cargo = readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8')
const cargoLock = readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8')
const cargoVersion = cargo.match(/^\[package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/m)?.[1]
const lockVersion = cargoLock.match(/^name = "toolbox-app"\r?\nversion = "([^"]+)"/m)?.[1]
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('正式发布仅接受 x.y.z 版本号。')
if ([config.version, npmLock.version, npmLock.packages[''].version, cargoVersion, lockVersion].some((value) => value !== pkg.version)) throw new Error('前端、Tauri 和 Rust 的版本号不一致，请执行 release:version。')
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) throw new Error('Git 标签必须与项目版本号一致。')
if (!config.bundle.createUpdaterArtifacts || !config.bundle.targets.includes('nsis')) throw new Error('发布必须生成 NSIS 安装包和更新签名。')
if (!config.plugins?.updater?.pubkey || !config.plugins.updater.endpoints?.every((url) => url.startsWith('https://'))) throw new Error('更新公钥或 HTTPS 地址未配置。')
if (config.plugins.updater.endpoints.length === 0) throw new Error('更新地址不能为空。')
console.log(`发布配置版本：${pkg.version}`)
