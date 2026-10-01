export type CsvDelimiter = ',' | '\t' | ';'

export const csvLimits = {
  inputBytes: 5 * 1024 * 1024,
  dataRows: 20_000,
  columns: 200,
  cells: 200_000,
  cellCharacters: 100_000,
  exportBytes: 16 * 1024 * 1024,
} as const

export interface CsvData {
  headers: string[]
  originalHeaders: string[]
  rows: string[][]
  renamedHeaders: number
  skippedBlankRows: number
}

function makeHeaders(original: string[]): string[] {
  // Reserve existing names so generated keys never steal a later, distinct header.
  const reserved = new Set(original.filter((header) => header.trim() !== ''))
  const used = new Set<string>()
  return original.map((header, index) => {
    const base = header.trim() ? header : `column_${index + 1}`
    let key = base
    let suffix = 2
    while (used.has(key) || (key !== header && reserved.has(key))) key = `${base}__${suffix++}`
    used.add(key)
    return key
  })
}

export function parseCsv(input: string, delimiter: CsvDelimiter = ','): CsvData {
  if (![',', '\t', ';'].includes(delimiter)) throw new Error('请选择逗号、制表符或分号作为分隔符。')
  if (input.length > csvLimits.inputBytes || new TextEncoder().encode(input).byteLength > csvLimits.inputBytes) {
    throw new Error('CSV 输入超过 5 MiB，请缩小文件或粘贴内容。')
  }
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let state: 'plain' | 'quoted' | 'closed' = 'plain'
  let started = false
  let line = 1
  let recordLine = 1
  let cellCount = 0
  let skippedBlankRows = 0

  function fail(message: string): never {
    throw new Error(`第 ${records.length + 1} 条记录（第 ${recordLine} 行起）：${message}`)
  }
  function append(value: string): void {
    cell += value
    if (cell.length > csvLimits.cellCharacters) fail('单个单元格超过 100,000 个字符。')
  }
  function finishCell(): void {
    if (row.length >= csvLimits.columns) fail('列数超过 200 列。')
    if (++cellCount > csvLimits.cells) fail('单元格总数超过 200,000 个（含表头）。')
    row.push(cell)
    cell = ''
    state = 'plain'
  }
  function finishRecord(): void {
    if (!started) { skippedBlankRows++; return }
    finishCell()
    if (records.length > csvLimits.dataRows) fail('数据超过 20,000 行（不含表头）。')
    if (records.length && row.length !== records[0].length) {
      fail(`有 ${row.length} 列，表头有 ${records[0].length} 列；请检查分隔符或补齐空字段。`)
    }
    records.push(row)
    row = []
    started = false
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') { append('"'); index++ }
        else state = 'closed'
      } else {
        append(character)
        if (character === '\r') {
          if (text[index + 1] === '\n') { append('\n'); index++ }
          line++
        } else if (character === '\n') line++
      }
      continue
    }
    if (character === delimiter) {
      started = true
      finishCell()
    } else if (character === '\r' || character === '\n') {
      finishRecord()
      if (character === '\r' && text[index + 1] === '\n') index++
      recordLine = ++line
    } else if (state === 'closed') {
      fail('结束引号后只能紧接分隔符或换行，不能有其他字符或空格。')
    } else if (character === '"') {
      if (cell.length) fail('字段中的双引号必须使用双引号包围整个字段，并用两个双引号转义。')
      started = true
      state = 'quoted'
    } else {
      started = true
      append(character)
    }
  }
  if (state === 'quoted') fail('双引号未闭合；多行字段也需要结束引号。')
  if (started) finishRecord()
  if (!records.length) throw new Error('没有可读取的 CSV 记录，请输入表头和数据。')
  const originalHeaders = records[0]
  const headers = makeHeaders(originalHeaders)
  return {
    headers,
    originalHeaders,
    rows: records.slice(1),
    renamedHeaders: headers.filter((header, index) => header !== originalHeaders[index]).length,
    skippedBlankRows,
  }
}

export function filterCsvRows(data: CsvData, query: string): number[] {
  const needle = query.toLowerCase()
  const indices: number[] = []
  data.rows.forEach((row, index) => {
    if (!needle || row.some((cell) => cell.toLowerCase().includes(needle))) indices.push(index)
  })
  return indices
}

export function csvToJson(data: CsvData, rowIndices?: readonly number[]): string {
  const indices = rowIndices ?? data.rows.map((_, index) => index)
  if (!indices.length) return '[]'
  const pieces: string[] = []
  const encoder = new TextEncoder()
  let bytes = 4 // Opening and closing array brackets and their newlines.
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= data.rows.length) {
      throw new Error('导出行索引无效，请重新解析 CSV。')
    }
    const record: Record<string, string> = Object.create(null)
    data.headers.forEach((header, column) => { record[header] = data.rows[index][column] })
    const piece = `  ${JSON.stringify(record)}`
    bytes += encoder.encode(piece).byteLength + (pieces.length ? 2 : 0)
    if (bytes > csvLimits.exportBytes) throw new Error('JSON 导出超过 16 MiB，请减少行数或缩短表头后重试。')
    pieces.push(piece)
  }
  return `[\n${pieces.join(',\n')}\n]`
}
