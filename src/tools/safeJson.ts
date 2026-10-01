// A bounded JSON reader validates number lexemes and duplicate keys before any
// information can be lost to JSON.parse. Shared by formatting, diff and JSONPath.
export type SafeJsonValue = null | boolean | number | string | SafeJsonValue[] | { [key: string]: SafeJsonValue }
export const jsonLimits = { inputBytes: 1024 * 1024, outputBytes: 4 * 1024 * 1024, depth: 128, nodes: 50_000, changes: 1000, diffBytes: 2 * 1024 * 1024 }
const encoder = new TextEncoder()
export function checkJsonSize(text: string, limit: number, label: string): void {
  if (text.length > limit || encoder.encode(text).length > limit) throw new Error(`${label}超过 ${limit / 1024 / 1024} MiB 上限。`)
}
function decimalForm(text: string): string {
  const [mantissa, exponent = '0'] = text.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  let digits = unsigned.replace('.', '').replace(/^0+/, '')
  if (!digits) return negative ? '-0' : '0'
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0
  const decimal = unsigned.includes('.') ? unsigned.length - unsigned.indexOf('.') - 1 : 0
  digits = digits.slice(0, digits.length - trailing)
  return `${negative ? '-' : ''}${digits}e${BigInt(exponent) - BigInt(decimal) + BigInt(trailing)}`
}
export function parseSafeJson(source: string): SafeJsonValue {
  checkJsonSize(source, jsonLimits.inputBytes, 'JSON 输入')
  let position = 0, nodes = 0
  const fail = (): never => { throw new Error(`JSON 语法错误：第 ${position + 1} 个字符附近无效。`) }
  const whitespace = (): void => { while (/[\x20\t\r\n]/.test(source[position] ?? '') && position < source.length) position++ }
  function string(): string {
    const start = position++
    while (position < source.length) {
      const character = source[position++]
      if (character === '\\') { position++; continue }
      if (character === '"') {
        try { return JSON.parse(source.slice(start, position)) as string } catch { fail() }
      }
    }
    return fail()
  }
  function value(depth: number): SafeJsonValue {
    if (depth > jsonLimits.depth) throw new Error('JSON 嵌套不能超过 128 层。')
    if (++nodes > jsonLimits.nodes) throw new Error('JSON 节点不能超过 50,000 个。')
    whitespace()
    const character = source[position]
    if (character === '"') return string()
    if (character === '{' || character === '[') {
      position++; whitespace()
      const object = character === '{'
      const close = object ? '}' : ']'
      const result: { [key: string]: SafeJsonValue } = Object.create(null)
      const array: SafeJsonValue[] = []
      if (source[position] === close) { position++; return object ? result : array }
      while (position < source.length) {
        if (object) {
          if (source[position] !== '"') fail()
          const key = string(); whitespace()
          if (Object.hasOwn(result, key)) throw new Error(`JSON 存在重复键 ${JSON.stringify(key).slice(0, 120)}，无法无损处理。`)
          if (++nodes > jsonLimits.nodes) throw new Error('JSON 节点不能超过 50,000 个。')
          if (source[position++] !== ':') fail()
          result[key] = value(depth + 1)
        } else array.push(value(depth + 1))
        whitespace()
        if (source[position] === close) { position++; return object ? result : array }
        if (source[position++] !== ',') fail()
        whitespace()
      }
      return fail()
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, position)) { position += literal.length; return result }
    }
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(position))?.[0]
    if (!token) return fail()
    position += token.length
    // Cap numerical lexemes before BigInt exponent normalization; ordinary JSON
    // strings are unaffected. Never try to recover precision after parsing.
    if (token.length > 1024) throw new Error('数字字面值过长，无法无损处理；请使用字符串。')
    const number = Number(token)
    if (!Number.isFinite(number) || Object.is(number, -0) || (Number.isInteger(number) && !Number.isSafeInteger(number)) || decimalForm(token) !== decimalForm(String(number))) {
      throw new Error('数值超出安全范围、为负零或会发生精度损失/下溢，无法无损处理；请加引号作为字符串。')
    }
    return number
  }
  const result = value(0); whitespace()
  if (position !== source.length) fail()
  return result
}
export function formatSafeJson(input: string, compact = false): string {
  const result = JSON.stringify(parseSafeJson(input), null, compact ? undefined : 2)
  checkJsonSize(result, jsonLimits.outputBytes, 'JSON 输出')
  return result
}
export type JsonChange = { type: 'added' | 'removed' | 'changed'; path: string; before?: string; after?: string }
export function compareSafeJson(left: string, right: string): JsonChange[] {
  function read(source: string, side: string): SafeJsonValue {
    try { return parseSafeJson(source) } catch (cause) { throw new Error(`${side}：${cause instanceof Error ? cause.message : 'JSON 无效。'}`) }
  }
  const before = read(left, '左侧'), after = read(right, '右侧'), changes: JsonChange[] = []
  let bytes = 0
  function add(type: JsonChange['type'], path: string, before?: SafeJsonValue, after?: SafeJsonValue): void {
    if (changes.length >= jsonLimits.changes) throw new Error('差异超过 1000 处，请缩小比较范围；未发布部分结果。')
    const change = { type, path, before: before === undefined ? undefined : JSON.stringify(before, null, 2), after: after === undefined ? undefined : JSON.stringify(after, null, 2) }
    bytes += encoder.encode(JSON.stringify(change)).length
    if (bytes > jsonLimits.diffBytes) throw new Error('差异结果超过 2 MiB，请缩小比较范围；未发布部分结果。')
    changes.push(change)
  }
  function compare(before: SafeJsonValue, after: SafeJsonValue, path: string): void {
    if (Array.isArray(before) && Array.isArray(after)) {
      for (let index = 0; index < Math.max(before.length, after.length); index++) {
        const location = `${path}[${index}]`
        if (index >= before.length) add('added', location, undefined, after[index])
        else if (index >= after.length) add('removed', location, before[index])
        else compare(before[index], after[index], location)
      }
    } else if (before !== null && after !== null && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const location = /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`
        if (!Object.hasOwn(before, key)) add('added', location, undefined, after[key])
        else if (!Object.hasOwn(after, key)) add('removed', location, before[key])
        else compare(before[key], after[key], location)
      }
    } else if (!Object.is(before, after)) add('changed', path, before, after)
  }
  compare(before, after, '$')
  return changes
}
