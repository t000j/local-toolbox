import { exportPdfPages, loadPageDocument } from './pdfPages'
import { auditPdfPreview } from './pdfPreviewGate'
import { validatePdfRasterOptions } from './pdfRasterLimits'
import type { PdfRasterOptions } from './pdfRasterLimits'
// This function is called only from the dedicated raster worker in production.
export async function preparePdfRaster(bytes: Uint8Array, request: PdfRasterOptions): Promise<{ bytes: Uint8Array; sourcePages: number }> {
  const options = validatePdfRasterOptions(request), doc = await loadPageDocument(bytes)
  if (options.pages.some(page => page > doc.getPageCount())) throw new Error('所选页码超出原文档范围。')
  auditPdfPreview(doc)
  return { bytes: (await exportPdfPages(bytes, options.pages)).bytes, sourcePages: doc.getPageCount() }
}
