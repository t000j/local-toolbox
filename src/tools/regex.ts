export const regexLimits = { input: 100_000, pattern: 2000, matches: 500, resultBytes: 2 * 1024 * 1024 }
export type RegexRequest = { pattern: string; flags: string; input: string }
export type RegexMatch = { index: number; end: number; value: string; captures: (string | null)[]; groups: Record<string, string | null> }
export type RegexResult = { matches: RegexMatch[]; truncated: boolean; elapsedMs: number }

export function testRegex({ pattern, flags, input }: RegexRequest): RegexResult {
  const started = performance.now()
  if (!pattern || pattern.length > regexLimits.pattern) throw new Error('请输入 1—2000 个字符的表达式，不包含 / 分隔符。')
  if (input.length > regexLimits.input) throw new Error('样本文本不能超过 100,000 个字符。')
  if (!/^[gimsuy]*$/.test(flags) || new Set(flags).size !== flags.length) throw new Error('标志只能为不重复的 g、i、m、s、u、y。')
  let regex: RegExp
  try { regex = new RegExp(pattern, flags) }
  catch (cause) { throw new Error(`表达式无效：${cause instanceof Error ? cause.message : '请检查语法。'}`) }
  const matches: RegexMatch[] = []
  const encoder = new TextEncoder()
  let bytes = 0
  let truncated = false
  while (true) {
    if (matches.length >= regexLimits.matches) { truncated = true; break }
    const match = regex.exec(input)
    if (!match) break
    // Check a conservative bound before serialization, including repeated captured text.
    let estimate = 128
    for (const value of match) estimate += (value?.length ?? 0) * 6 + 8
    for (const [key, value] of Object.entries(match.groups ?? {})) estimate += (key.length + (value?.length ?? 0)) * 6 + 16
    if (bytes + estimate > regexLimits.resultBytes) { truncated = true; break }
    const item: RegexMatch = {
      index: match.index, end: match.index + match[0].length, value: match[0],
      captures: match.slice(1).map(value => value ?? null),
      groups: Object.fromEntries(Object.entries(match.groups ?? {}).map(([key, value]) => [key, value ?? null])),
    }
    bytes += encoder.encode(JSON.stringify(item)).byteLength
    matches.push(item)
    if (!regex.global) break
    if (match[0] === '') {
      // RegExp.exec does not advance zero-length matches. Respect Unicode code points.
      const point = input.codePointAt(regex.lastIndex)
      regex.lastIndex += regex.unicode && point !== undefined && point > 0xffff ? 2 : 1
    }
  }
  return { matches, truncated, elapsedMs: Math.round(performance.now() - started) }
}
