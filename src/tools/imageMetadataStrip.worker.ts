/// <reference lib="webworker" />
import { stripImageMetadata } from './imageMetadataStrip'
import { validateImageFiles } from './imageProcessing'
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    validateImageFiles([event.data])
    const result = stripImageMetadata(new Uint8Array(await event.data.arrayBuffer()))
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
