import { runZip, type ZipRequest } from './zipArchive'
self.onmessage = async (event: MessageEvent<ZipRequest>) => {
  try { self.postMessage({ ok: true, result: await runZip(event.data) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'ZIP 处理失败。' }) }
}
