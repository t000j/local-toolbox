import { PDFDocument, PDFRawStream } from 'pdf-lib'
import { auditPdfTextResources } from './pdfPreviewGate'
import { pdfFail } from './pdfRawSyntax'
/** Mutates only the already-admitted, private text-worker document. An Image Do
 * cannot produce selectable text. Every incoming use must prove this role first.
 * Substitute before serialization: even fetching a lazy image stream in PDF.js
 * can construct filters/predictors, so merely skipping image painting is insufficient. */
export function preparePdfTextResources(doc: PDFDocument): number {
  const images = auditPdfTextResources(doc), replacements = doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && images.has(object))
  if (replacements.length !== images.size) pdfFail('文字提取图片必须具有唯一的已验证间接对象定义。')
  for (const [ref] of replacements) {
    doc.context.assign(ref, doc.context.stream(new Uint8Array([0]), { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }))
  }
  return replacements.length
}
