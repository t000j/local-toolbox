import { Inflate } from 'pako'
import { pdfFail } from './pdfRawSyntax'
export function boundedInflatePdf(bytes: Uint8Array, limit: number): Uint8Array {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(limit) || limit < 1 || limit > 32 * 1024 * 1024 || bytes.length < 6 || bytes.length > 16 * 1024 * 1024) pdfFail('结构流压缩或展开大小超出上限。')
  const input = new Uint8Array(bytes), parts: Uint8Array[] = []; let length = 0, status: number | undefined
  const inflater = new Inflate({ chunkSize: 16 * 1024, windowBits: 15 }) // zlib only, never gzip/autodetect
  inflater.onData = chunk => {
    if (!(chunk instanceof Uint8Array) || chunk.length > 16 * 1024 || chunk.length > limit - length) pdfFail('结构流展开超过安全上限；已在固定大小分块处停止。')
    length += chunk.length; parts.push(chunk)
  }
  inflater.onEnd = value => { status = value }
  // In this pako version push(..., true) can finish an incomplete stream. False lets only Z_STREAM_END end it.
  if (!inflater.push(input, false) || !inflater.ended || inflater.err || status !== 0 || inflater.strm.avail_in !== 0 || inflater.strm.next_in !== input.length || inflater.strm.total_in !== input.length) pdfFail('结构流校验失败、被截断或包含尾随压缩数据。')
  const output = new Uint8Array(length); let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

export function inflatePdfStructure(bytes: Uint8Array, limit: number): Uint8Array {
  if (!(bytes instanceof Uint8Array) || limit > 1024 * 1024 || bytes.length > 2 * 1024 * 1024) pdfFail('结构流超过专用大小上限。')
  return boundedInflatePdf(bytes, limit)
}
