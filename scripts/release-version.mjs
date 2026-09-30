import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]?.replace(/^v/, '')
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('请提供正式版本号，例如：npm run release:version -- 0.1.1')
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
const writeJson = (file, data) => writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`)
const pkg = readJson('package.json')
const config = readJson('src-tauri/tauri.conf.json')
const npmLock = readJson('package-lock.json')
const cargoPath = path.join(root, 'src-tauri/Cargo.toml')
const cargoLockPath = path.join(root, 'src-tauri/Cargo.lock')
const cargo = readFileSync(cargoPath, 'utf8')
const cargoLock = readFileSync(cargoLockPath, 'utf8')
const packageSection = /(^\[package\][\s\S]*?\bversion\s*=\s*")[^"]+("[\s\S]*?)(?=^\[|$)/m
const lockSection = /(^name = "local-toolbox"\r?\nversion = ")[^"]+(")/m
if (!packageSection.test(cargo) || !lockSection.test(cargoLock)) throw new Error('无法定位 Rust 项目版本字段，未写入任何文件。')
pkg.version = version
config.version = version
npmLock.version = version
npmLock.packages[''].version = version
writeJson('package.json', pkg)
writeJson('src-tauri/tauri.conf.json', config)
writeJson('package-lock.json', npmLock)
writeFileSync(cargoPath, cargo.replace(packageSection, (_, before, after) => before + version + after))
writeFileSync(cargoLockPath, cargoLock.replace(lockSection, (_, before, after) => before + version + after))
console.log(`版本已同步为 ${version}；请审核并提交这些版本文件，再创建 v${version} 标签。`)
