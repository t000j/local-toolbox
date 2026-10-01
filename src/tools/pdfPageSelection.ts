import { pdfFail } from './pdfRawSyntax'
export function parsePageSelection(text: string, count: number): number[] {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 || !Number.isInteger(count) || count < 1 || count > 200) pdfFail('页码范围不能为空，文档须为1–200页。')
  const pages: number[] = [], seen = new Set<number>()
  for (const token of text.split(',')) {
    const match = /^\s*([1-9]\d{0,2})(?:\s*-\s*([1-9]\d{0,2}))?\s*$/.exec(token)
    if (!match) pdfFail('使用英文逗号和升序范围，例如 1-3,5,8-10。')
    const start = Number(match[1]), end = Number(match[2] ?? match[1])
    if (start > end || end > count) pdfFail(`页码必须在1–${count}内；范围不能倒序。`)
    for (let page = start; page <= end; page++) {
      if (seen.has(page)) pdfFail(`第${page}页重复；请移除重叠范围。`)
      seen.add(page); pages.push(page)
    }
  }
  return pages
}
