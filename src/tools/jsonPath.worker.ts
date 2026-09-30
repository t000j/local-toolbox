import { exec, type JsonValue, type Path } from 'jsonpath-rfc9535'
import { jsonPathLimits, type JsonPathMatch, type JsonPathRequest, type JsonPathResponse } from './jsonPathTypes'

interface QueryWorker { onmessage: ((event: MessageEvent<JsonPathRequest>) => void) | null; postMessage: (reply: JsonPathResponse) => void }
const scope = globalThis as unknown as QueryWorker
const encoder = new TextEncoder()
const resultLimit = Symbol('jsonpath-result-limit')

function validateInput(value: JsonValue): void {
  const stack: { value: JsonValue; depth: number }[] = [{ value, depth: 0 }]
  let visited = 0
  while (stack.length) {
    const item = stack.pop()!
    if (++visited > jsonPathLimits.nodes || item.depth > jsonPathLimits.depth) throw new Error('JSON 节点过多或层级过深，请缩小数据范围。')
    if (typeof item.value === 'number' && (!Number.isFinite(item.value) || (Number.isInteger(item.value) && !Number.isSafeInteger(item.value)))) {
      throw new Error('JSON 中存在超出可表示范围或安全整数范围的数值，请将此类大整数标识改为字符串。')
    }
    if (item.value !== null && typeof item.value === 'object') {
      const children = Array.isArray(item.value) ? item.value : Object.values(item.value)
      if (visited + stack.length + children.length > jsonPathLimits.nodes) throw new Error('JSON 节点超过 50,000 个，请缩小数据范围。')
      for (const child of children) stack.push({ value: child, depth: item.depth + 1 })
    }
  }
}
function absolutePath(path: Path): string {
  // The library already escapes property names while capturing the normalized path.
  return '$' + path.map((part) => typeof part === 'number' ? `[${part}]` : `['${part}']`).join('')
}
function valueType(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
scope.onmessage = (event) => {
  const started = performance.now()
  try {
    const { input, expression } = event.data
    if (encoder.encode(input).byteLength > jsonPathLimits.inputBytes) throw new Error('JSON 输入超过 1 MiB。')
    if (!expression.trim() || expression.length > jsonPathLimits.expressionLength) throw new Error('请输入不超过 2000 个字符的 JSONPath。')
    let data: JsonValue
    try { data = JSON.parse(input) as JsonValue }
    catch (cause) { throw new Error(`JSON 语法错误：${cause instanceof Error ? cause.message : '请检查输入。'}`) }
    validateInput(data)
    const matches: JsonPathMatch[] = []
    const values: string[] = []
    let resultBytes = 0
    let truncated = false
    let limitReason: 'count' | 'size' | null = null
    try {
      exec(data, expression.trim(), (value, path) => {
        if (matches.length >= jsonPathLimits.matches) { truncated = true; limitReason = 'count'; throw resultLimit }
        const location = absolutePath(path)
        const valueText = JSON.stringify(value, null, 2)
        const valueJson = JSON.stringify(value)
        const bytes = encoder.encode(location).byteLength + encoder.encode(valueText).byteLength + encoder.encode(valueJson).byteLength + 128
        if (resultBytes + bytes > jsonPathLimits.resultBytes) { truncated = true; limitReason = 'size'; throw resultLimit }
        resultBytes += bytes
        matches.push({ path: location, valueText, valueType: valueType(value) })
        values.push(valueJson)
      })
    } catch (cause) {
      if (cause !== resultLimit) throw new Error(`JSONPath 查询错误：${cause instanceof Error ? cause.message : '表达式无效。'}`)
    }
    scope.postMessage({ ok: true, result: { matches, valuesJson: '[' + values.join(',') + ']', truncated, limitReason, elapsedMs: Math.round(performance.now() - started) } })
  } catch (cause) {
    scope.postMessage({ ok: false, error: cause instanceof Error ? cause.message : '查询未能完成，请检查输入和表达式。' })
  }
}
