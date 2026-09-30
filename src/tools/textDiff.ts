export interface TextDiffRequest { before: string; after: string }
export interface DiffLine { kind: 'same' | 'add' | 'remove'; text: string; oldLine: number | null; newLine: number | null }
export interface TextDiffResult { lines: DiffLine[]; added: number; removed: number }

export function compareText({ before, after }: TextDiffRequest): TextDiffResult {
  if (before.length > 100_000 || after.length > 100_000) throw new Error('每段文本最多 100,000 个字符。')
  const split = (value: string) => value === '' ? [] : value.replace(/\r\n?/g, '\n').split('\n')
  const a = split(before), b = split(after)
  if (a.length > 2000 || b.length > 2000) throw new Error('每段文本最多 2000 行，请缩小比较范围。')
  const width = b.length + 1
  const lengths = new Uint16Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * width + j] = a[i] === b[j] ? lengths[(i + 1) * width + j + 1]! + 1
        : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!)
    }
  }
  const lines: DiffLine[] = []
  let i = 0, j = 0, added = 0, removed = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]!, oldLine: ++i, newLine: ++j })
    } else if (j < b.length && (i === a.length || lengths[i * width + j + 1]! > lengths[(i + 1) * width + j]!)) {
      lines.push({ kind: 'add', text: b[j]!, oldLine: null, newLine: ++j }); added++
    } else {
      lines.push({ kind: 'remove', text: a[i]!, oldLine: ++i, newLine: null }); removed++
    }
  }
  return { lines, added, removed }
}
