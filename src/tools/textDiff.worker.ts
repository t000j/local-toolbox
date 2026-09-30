import { compareText, type TextDiffRequest } from './textDiff'
self.onmessage = (event: MessageEvent<TextDiffRequest>) => {
  try { self.postMessage({ ok: true, result: compareText(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : '比较失败。' }) }
}
