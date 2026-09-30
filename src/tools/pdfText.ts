export interface PdfTextPage { page: number; text: string; items: number }
export interface PdfTextResult { pages: PdfTextPage[]; sourcePages: number; text: string; bytes: Uint8Array }
export const PDF_TEXT_LIMITS = Object.freeze({ pages: 50, items: 100_000, chars: 1_000_000, bytes: 4 * 1024 * 1024 })
// Preserve PDF.js item order and its line endings. Never infer visual column order.
export function textAccumulator() {
  let chars = 0, items = 0
  return { append(chunk: unknown, parts: string[]): number {
    if (!chunk || typeof chunk !== 'object' || !Array.isArray((chunk as { items?: unknown }).items)) throw new Error('文字结果结构无效。')
    let count = 0
    for (const item of (chunk as { items: unknown[] }).items) {
      if (!item || typeof item !== 'object') throw new Error('文字项目无效。')
      if (!('str' in item)) continue
      const value = item as { str: unknown; hasEOL?: unknown }
      if (typeof value.str !== 'string' || (value.hasEOL !== undefined && typeof value.hasEOL !== 'boolean')) throw new Error('文字项目字段无效。')
      if (++items > PDF_TEXT_LIMITS.items) throw new Error('文字项目总量超过100000。')
      const text = value.str + (value.hasEOL ? '\n' : '')
      chars += text.length
      if (chars > PDF_TEXT_LIMITS.chars) throw new Error('提取文字超过100万字符。')
      parts.push(text); count++
    }
    return count
  } }
}
export function finishPdfText(pages: PdfTextPage[], sourcePages: number): PdfTextResult {
  if (!pages.length || pages.length > PDF_TEXT_LIMITS.pages) throw new Error('一次仅支持1–50页。')
  const text = pages.map(page => `--- 第 ${page.page} 页 ---\n${page.text}`).join('\n\n'), bytes = new TextEncoder().encode(text)
  if (bytes.length > PDF_TEXT_LIMITS.bytes) throw new Error('UTF-8文字输出超过4MiB。')
  return { pages, sourcePages, text, bytes }
}
