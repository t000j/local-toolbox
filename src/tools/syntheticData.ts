export const syntheticDataLimits = { rows: 1000, outputBytes: 1024 * 1024 } as const
export const syntheticFields = [
  { key: 'id', label: '序号', sqlType: 'INTEGER' },
  { key: 'name', label: '虚构姓名', sqlType: 'TEXT' },
  { key: 'email', label: '示例邮箱', sqlType: 'TEXT' },
  { key: 'date', label: '日期', sqlType: 'TEXT' },
  { key: 'active', label: '布尔值', sqlType: 'INTEGER' },
  { key: 'note', label: '含特殊字符的备注', sqlType: 'TEXT' },
] as const
export type SyntheticField = typeof syntheticFields[number]['key']
export type SyntheticFormat = 'json' | 'csv' | 'sql'
export interface SyntheticOptions {
  count: number
  seed: number
  fields: SyntheticField[]
  startDate: string
  endDate: string
  format: SyntheticFormat
  tableName: string
}
export interface SyntheticResult {
  text: string
  rowCount: number
  columns: string[]
  bytes: number
}
type SampleValue = string | number | boolean
const DAY = 86_400_000
const names = ['虚构姓名·青竹', '虚构姓名·白云', '虚构姓名·星河', '虚构姓名·晴空']
const notes = ['虚构样例，仅供测试', '虚构备注：逗号, 与分号;', '虚构备注："双引号" 与 O\'Example',
  '虚构备注：第一行\r\n第二行', '虚构路径：C:\\example\\test', '虚构 Unicode：你好 🧪']

function dateDay(input: string): number {
  if (typeof input !== 'string' || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('日期必须为 1900–2199 年间的有效 YYYY-MM-DD 日期。')
  }
  const time = Date.parse(`${input}T00:00:00Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== input) {
    throw new Error('日期不存在，请检查月份、天数和闰年。')
  }
  return time / DAY
}

// Reproducible sample variety only. This is deliberately NOT a password/token generator.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}
function csvValue(value: SampleValue): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
function sqlValue(value: SampleValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  // SQLite uses doubled apostrophes, and leaves backslashes / line breaks literal.
  return `'${value.replace(/'/g, "''")}'`
}

export function generateSyntheticData(options: SyntheticOptions): SyntheticResult {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > syntheticDataLimits.rows) {
    throw new Error('数量必须为 1 至 1000 的整数。')
  }
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) {
    throw new Error('种子必须为 0 至 4294967295 的整数。')
  }
  if (!['json', 'csv', 'sql'].includes(options.format)) throw new Error('请选择 JSON、CSV 或 SQLite SQL。')
  if (!Array.isArray(options.fields) || !options.fields.length || options.fields.length > syntheticFields.length
    || new Set(options.fields).size !== options.fields.length
    || options.fields.some(key => !syntheticFields.some(field => field.key === key))) {
    throw new Error('请至少选择一个有效字段，字段不能重复。')
  }
  if (options.format === 'sql' && (typeof options.tableName !== 'string'
    || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(options.tableName) || /^sqlite_/i.test(options.tableName))) {
    throw new Error('SQL 表名限 1–63 个英文字母、数字或下划线，不能以数字开头或使用保留前缀 sqlite_。')
  }
  const fields = syntheticFields.filter(field => options.fields.includes(field.key))
  const hasDate = options.fields.includes('date')
  const firstDay = hasDate ? dateDay(options.startDate) : 0
  const lastDay = hasDate ? dateDay(options.endDate) : 0
  if (firstDay > lastDay) throw new Error('开始日期不能晚于结束日期。')
  const random = seededRandom(options.seed)
  const columns = ['_synthetic', ...fields.map(field => field.key)]
  const rows: Record<string, SampleValue>[] = []
  for (let index = 0; index < options.count; index++) {
    const suffix = String(index + 1).padStart(4, '0')
    const sample: Record<SyntheticField, SampleValue> = {
      id: index + 1,
      name: `${names[Math.floor(random() * names.length)]}-${suffix}`,
      email: `sample${suffix}@example.invalid`,
      date: new Date((firstDay + Math.floor(random() * (lastDay - firstDay + 1))) * DAY).toISOString().slice(0, 10),
      active: random() >= 0.5,
      note: notes[index % notes.length],
    }
    const row: Record<string, SampleValue> = { _synthetic: true }
    for (const field of fields) row[field.key] = sample[field.key]
    rows.push(row)
  }
  let text: string
  if (options.format === 'json') text = JSON.stringify(rows, null, 2)
  else if (options.format === 'csv') {
    text = [columns.join(','), ...rows.map(row => columns.map(key => csvValue(row[key])).join(','))].join('\r\n') + '\r\n'
  } else {
    const table = `"${options.tableName}"`
    const definitions = ['"_synthetic" INTEGER NOT NULL', ...fields.map(field => `"${field.key}" ${field.sqlType} NOT NULL`)]
    text = '-- Fictional test data only. SQLite 3; dates are TEXT, booleans are 0/1.\n'
      + `CREATE TABLE ${table} (\n  ${definitions.join(',\n  ')}\n);\n\n`
      + `INSERT INTO ${table} (${columns.map(key => `"${key}"`).join(', ')}) VALUES\n`
      + rows.map(row => `  (${columns.map(key => sqlValue(row[key])).join(', ')})`).join(',\n') + ';\n'
  }
  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes > syntheticDataLimits.outputBytes) throw new Error('输出超过 1 MiB，请减少样例数量。')
  return { text, rowCount: rows.length, columns, bytes }
}
