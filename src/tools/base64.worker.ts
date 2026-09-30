import { convertBase64, type Base64Request } from './base64'
self.onmessage = (event: MessageEvent<Base64Request>) => {
  try { self.postMessage({ ok: true, result: convertBase64(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : '转换失败。' }) }
}
