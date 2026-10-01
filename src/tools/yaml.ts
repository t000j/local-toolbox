import { Document, isAlias, isMap, isScalar, isSeq, parseDocument, Parser, visit } from 'yaml'

export const YAML_INPUT_LIMIT = 1024 * 1024
const OUTPUT_LIMIT = 4 * 1024 * 1024
const DEPTH_LIMIT = 80
const NODE_LIMIT = 50_000
const ALIAS_LIMIT = 100
const coreTags = new Set(['str', 'null', 'bool', 'int', 'float', 'map', 'seq'].map((tag) => `tag:yaml.org,2002:${tag}`))
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

function checkSize(value: string, limit: number, label: string): void {
  if (value.length > limit || new TextEncoder().encode(value).length > limit) {
    throw new Error(`${label}超过 ${limit / 1024 / 1024} MiB 上限，请缩小内容后重试。`)
  }
}

// Inspect the iterative parser's CST before the recursive composer sees it.
function checkStructure(source: string): void {
  let documents = 0
  let nodes = 0
  for (const token of new Parser().parse(source)) {
    if (token.type === 'document' && ++documents > 1) throw new Error('仅支持单个 YAML 文档，请分别处理多个文档。')
    const stack: { value: unknown; depth: number }[] = [{ value: token, depth: 0 }]
    while (stack.length) {
      const { value, depth } = stack.pop()!
      if (!value || typeof value !== 'object') continue
      if (++nodes > NODE_LIMIT * 8) throw new Error('文档结构过于复杂，请拆分后处理。')
      const record = value as Record<string, unknown>
      const collection = ['block-map', 'block-seq', 'flow-collection'].includes(String(record.type))
      const nextDepth = depth + (collection ? 1 : 0)
      if (nextDepth > DEPTH_LIMIT) throw new Error(`嵌套层级不能超过 ${DEPTH_LIMIT} 层。`)
      for (const child of Object.values(record)) {
        if (child && typeof child === 'object') stack.push({ value: child, depth: nextDepth })
      }
    }
  }
}

function readDocument(source: string, json = false): Document.Parsed {
  if (!source.trim()) throw new Error(`请输入 ${json ? 'JSON' : 'YAML'} 内容。`)
  checkSize(source, YAML_INPUT_LIMIT, '输入')
  try {
    checkStructure(source)
    // JSON.parse checks JSON syntax; the YAML AST then retains duplicate keys and exact integers for validation.
    if (json) JSON.parse(source)
    const document = parseDocument(source, {
      version: '1.2', schema: 'core', intAsBigInt: true, uniqueKeys: false, resolveKnownTags: false, strict: true,
    })
    const problem = document.errors[0] ?? document.warnings[0]
    if (problem) throw new Error(problem.message)
    if (document.directives.yaml.version !== '1.2') throw new Error('仅支持 YAML 1.2，请移除或修改其他版本声明。')
    if (!document.contents || (isScalar(document.contents) && document.contents.source === '')) {
      throw new Error('文档没有可处理的数据；如需空值，请明确输入 null。')
    }
    return document
  } catch (cause) {
    if (cause instanceof RangeError) throw new Error(`文档结构过于复杂，嵌套层级不能超过 ${DEPTH_LIMIT} 层。`)
    throw cause
  }
}

function decimalForm(source: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source)
  if (!match) return source
  let digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '')
  if (!digits) return match[1] === '-' ? '-0' : '0'
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0)
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0
  if (trailing) { digits = digits.slice(0, -trailing); exponent += trailing }
  return `${match[1] === '-' ? '-' : ''}${digits}e${exponent}`
}

function jsonValue(document: Document.Parsed): JsonValue {
  const active = new Set<object>()
  const aliases = new WeakMap<object, unknown>()
  let nodes = 0
  let aliasCount = 0
  let estimatedSize = 0

  function read(node: unknown, depth: number): JsonValue {
    if (depth > DEPTH_LIMIT) throw new Error(`展开后的嵌套层级不能超过 ${DEPTH_LIMIT} 层。`)
    if (++nodes > NODE_LIMIT) throw new Error(`展开后的数据不能超过 ${NODE_LIMIT.toLocaleString()} 个节点。`)
    estimatedSize += depth * 4 + 4
    if (estimatedSize > OUTPUT_LIMIT) throw new Error('展开后的内容过大，请缩小文档或减少别名引用。')
    if (node === null) return null
    if (!node || typeof node !== 'object') throw new Error('文档包含不支持的数据类型。')
    if (active.has(node)) throw new Error('检测到循环别名引用，无法安全转换为 JSON。')
    if ('tag' in node && node.tag && !coreTags.has(String(node.tag))) throw new Error('不支持自定义标签或扩展 YAML 类型。')
    active.add(node)
    try {
      if (isAlias(node)) {
        if (++aliasCount > ALIAS_LIMIT) throw new Error(`别名展开次数不能超过 ${ALIAS_LIMIT} 次。`)
        if (!aliases.has(node)) aliases.set(node, node.resolve(document))
        const target = aliases.get(node)
        if (!target) throw new Error(`别名 *${node.source} 没有对应的前置锚点。`)
        return read(target, depth)
      }
      if (isSeq(node)) return node.items.map((item) => read(item, depth + 1))
      if (isMap(node)) {
        const result: { [key: string]: JsonValue } = Object.create(null)
        for (const pair of node.items) {
          if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
            throw new Error('映射键必须是字符串，不能使用数字或复杂键。')
          }
          const key = read(pair.key, depth + 1) as string
          if (key === '<<' && pair.key.type === 'PLAIN') throw new Error('不支持 YAML 合并键 <<；请先展开合并内容。')
          if (Object.hasOwn(result, key)) throw new Error(`存在重复映射键：${JSON.stringify(key)}。`)
          result[key] = read(pair.value, depth + 1)
        }
        return result
      }
      if (!isScalar(node)) throw new Error('文档包含不支持的数据类型。')
      let value: unknown = node.value
      if (typeof value === 'bigint') {
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
          throw new Error('整数超出安全精度范围，请将其加引号作为字符串处理。')
        }
        if (value === 0n && node.source?.startsWith('-')) throw new Error('负零无法无损转换，请使用字符串 "-0"。')
        value = Number(value)
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('JSON 不支持 NaN 或无穷大；数值溢出也无法转换。')
        if (Object.is(value, -0)) throw new Error('负零无法无损转换，请使用字符串 "-0"。')
        if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
          throw new Error('数值超出安全整数范围，请加引号保留精度。')
        }
        if (typeof node.value === 'number' && node.source && decimalForm(node.source) !== decimalForm(String(value))) {
          throw new Error('数值会发生精度损失或下溢，请将其加引号作为字符串处理。')
        }
      }
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        estimatedSize += JSON.stringify(value).length
        if (estimatedSize > OUTPUT_LIMIT) throw new Error('展开后的内容超过 4 MiB 上限，请减少别名引用。')
        return value
      }
      throw new Error('仅支持字符串、有限数字、布尔值、空值、数组和字符串键对象。')
    } finally {
      active.delete(node)
    }
  }

  return read(document.contents, 0)
}

function indentation(indent: number): number {
  if (indent !== 2 && indent !== 4) throw new Error('缩进仅支持 2 或 4 个空格。')
  return indent
}

function checkedOutput(output: string): string {
  checkSize(output, OUTPUT_LIMIT, '输出')
  return output
}

export function validateYaml(source: string): void {
  jsonValue(readDocument(source))
}

export function formatYaml(source: string, indent = 2): string {
  const document = readDocument(source)
  jsonValue(document)
  return checkedOutput(document.toString({ indent: indentation(indent), collectionStyle: 'block', lineWidth: 0 }))
}

export function yamlToJson(source: string, indent = 2): string {
  return checkedOutput(JSON.stringify(jsonValue(readDocument(source)), null, indentation(indent)))
}

export function jsonToYaml(source: string, indent = 2): string {
  const document = new Document(jsonValue(readDocument(source, true)))
  visit(document, { Pair(_key, pair) {
    if (isScalar(pair.key) && pair.key.value === '<<') pair.key.type = 'QUOTE_DOUBLE'
  } })
  return checkedOutput(document.toString({ indent: indentation(indent), lineWidth: 0, doubleQuotedAsJSON: true }))
}
