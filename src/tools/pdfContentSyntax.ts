import { pdfDelimiter, pdfFail } from './pdfRawSyntax'
// Lexical BI gate, not an interpreter. Resource roles, filters, expansion budgets
// and the independent CMap audit still run before PDF.js sees any stream.
export function rejectPdfInlineImages(bytes: Uint8Array): void {
  let position = 0
  while (position < bytes.length) {
    const character = bytes[position++]
    if (character === 37) { // comment
      while (position < bytes.length && ![10, 13].includes(bytes[position]!)) position++
    } else if (character === 40) { // literal string, with escaped/nested parentheses
      let depth = 1
      while (position < bytes.length && depth) {
        const byte = bytes[position++]
        if (byte === 92) {
          if (position === bytes.length) pdfFail('内容字符串转义被截断。')
          if (bytes[position++] === 13 && bytes[position] === 10) position++
        } else if (byte === 40) { if (++depth > 128) pdfFail('内容字符串嵌套超过128层。') }
        else if (byte === 41) depth--
      }
      if (depth) pdfFail('内容字符串未结束。')
    } else if (character === 60 && bytes[position] !== 60) { // hex string
      while (position < bytes.length && bytes[position] !== 62) position++
      if (position === bytes.length) pdfFail('内容十六进制字符串未结束。')
      position++
    } else if (character === 60 && bytes[position] === 60) {
      position++ // dictionary delimiter; keep scanning its values
    } else if (character === 47) { // a name, including #XX escapes, is never BI
      while (position < bytes.length && !pdfDelimiter(bytes[position])) position++
    } else if (!pdfDelimiter(character)) {
      const start = position - 1
      while (position < bytes.length && !pdfDelimiter(bytes[position])) position++
      // PDF.js splits adjacent known commands and numeric operands (qBI, 0BI).
      // Fail closed for BI anywhere in command runs, including BINARY outside
      // a string. Never apply this conservative check to textual operands.
      for (let i = start; i + 1 < position; i++) {
        if (bytes[i] === 66 && bytes[i + 1] === 73) pdfFail('暂不支持 BI 内联图像或含 BI 的命令序列。')
      }
    }
  }
}
