import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, '..', '本地工具箱-产品规划与技术选型.md')
const target = path.join(root, 'docs', 'PRODUCT_PLAN.md')
if (existsSync(source)) {
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(source, target)
  console.log('已同步工作目录中的产品规划到 docs/PRODUCT_PLAN.md。')
} else if (existsSync(target)) console.log('当前是独立源码仓库，保留 docs/PRODUCT_PLAN.md。')
else throw new Error('未找到产品规划源文档或仓库镜像。')
