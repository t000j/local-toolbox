import { marked } from 'marked'

export const markdownLimit = 100_000

export function parseMarkdown(input: string): string {
  if (input.length > markdownLimit) throw new Error('Markdown 不能超过 100,000 个字符。')
  const html = marked.parse(input, { async: false, gfm: true, breaks: false })
  if (html.length > 1_000_000) throw new Error('预览结果过大，请缩小输入。')
  return html
}
