/// <reference lib="webworker" />
import { parseImageHeader } from './imageHeaders'
import { validateImageFiles } from './imageProcessing'
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    validateImageFiles([event.data])
    const result = parseImageHeader(new Uint8Array(await event.data.arrayBuffer()))
    self.postMessage({ ok: true, result })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
