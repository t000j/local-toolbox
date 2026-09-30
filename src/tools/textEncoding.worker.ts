import { convertEncoding, type EncodingRequest } from './textEncoding'
self.onmessage = async (event: MessageEvent<EncodingRequest>) => {
  try { self.postMessage({ ok: true, result: await convertEncoding(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : '编码转换失败。' }) }
}
