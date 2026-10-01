import { format } from 'sql-formatter'

export const sqlLanguages = ['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql'] as const
export type SqlLanguage = typeof sqlLanguages[number]
export type SqlRequest = { input: string; language: SqlLanguage; indent: number; keywordCase: 'preserve' | 'upper' | 'lower' }
export const sqlInputLimit = 100_000

export function formatSql(request: SqlRequest): string {
  const { input, language, indent, keywordCase } = request
  if (!input.trim()) throw new Error('请先输入 SQL。')
  if (input.length > sqlInputLimit) throw new Error('SQL 输入不能超过 100,000 个字符。')
  if (!sqlLanguages.includes(language) || ![2, 4].includes(indent) || !['preserve', 'upper', 'lower'].includes(keywordCase)) {
    throw new Error('格式化选项无效。')
  }
  const output = format(input, { language, tabWidth: indent, keywordCase, linesBetweenQueries: 1 })
  if (output.length > 1_000_000) throw new Error('格式化结果超过 1,000,000 个字符，请缩小输入。')
  return output
}
