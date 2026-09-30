/// <reference lib="webworker" />
import { exportPdfPages, inspectPdfPages, loadPageDocument, parsePageSelection } from './pdfPages'
import { auditPdfPreview } from './pdfPreviewGate'
export type PdfPageRequest = { file: File; action: 'inspect' | 'split' | 'order' | 'rotate' | 'preview'; selection?: string; order?: number[]; rotations?: number[] }
self.onmessage = async (event: MessageEvent<PdfPageRequest>) => {
  try {
    const { file, action, selection, order, rotations } = event.data
    if (!file || !file.size || file.size > 8 * 1024 * 1024) throw new Error('请选择1字节至8MiB的PDF。')
    if (!['inspect', 'split', 'order', 'rotate', 'preview'].includes(action)) throw new Error('未知页面操作。')
    const bytes = new Uint8Array(await file.arrayBuffer()), pages = await inspectPdfPages(bytes)
    if (action === 'inspect') { self.postMessage({ ok: true, result: { pages } }); return }
    let selected: number[], turns: number[] | undefined
    if (action === 'preview') {
      selected = order ?? []; if (!selected.length || selected.length > 12) throw new Error('每批预览1–12页。')
      auditPdfPreview(await loadPageDocument(bytes))
    } else if (action === 'split') selected = parsePageSelection(selection ?? '', pages.length)
    else {
      selected = order ?? []
      if (selected.length !== pages.length || new Set(selected).size !== pages.length) throw new Error('排序/旋转必须恰好保留全部页面。')
      if (action === 'rotate') {
        if (selected.some((number, index) => number !== index + 1)) throw new Error('旋转操作不能改变页序。')
        turns = rotations
        if (!turns) throw new Error('缺少页面旋转清单。')
      }
    }
    const result = await exportPdfPages(bytes, selected, turns)
    self.postMessage({ ok: true, result }, { transfer: [result.bytes.buffer] })
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) }) }
}
