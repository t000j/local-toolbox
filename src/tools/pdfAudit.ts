import { PDFArray, PDFBool, PDFCatalog, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFObject, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import type { PdfPreflight } from './pdfPreflight'
import { PDF_MAX_DEPTH, PDF_MAX_NODES, PDF_MAX_OBJECTS, pdfFail } from './pdfRawSyntax'
const forbidden = new Set(('AcroForm XFA Sig DocMDP FieldMDP ByteRange Perms DSS VRI JavaScript JS AA OpenAction Launch URI GoTo GoToR GoToE SubmitForm ResetForm ImportData Hide Named SetOCGState Rendition RichMedia RichMediaContent Movie Sound 3D 3DD EmbeddedFile EmbeddedFiles Filespec EF AF Ref OPI Alternates FFilter FDecodeParms Collection OC OCProperties OCG OCMD StructTreeRoot StructParent StructParents StructElem MarkInfo RoleMap ClassMap ParentTree OutputIntents NeedsRendering Names Dests Outlines Threads PresSteps XRef ObjStm Crypt PS PostScript').split(' '))
const pageKeys = new Set(('Type Parent Resources MediaBox CropBox Rotate Contents BleedBox TrimBox ArtBox UserUnit Group Tabs Metadata Thumb PieceInfo LastModified Annots Trans').split(' '))
const treeKeys = new Set(('Type Parent Kids Count Resources MediaBox CropBox Rotate').split(' '))
export function auditPdf(doc: PDFDocument, preflight: PdfPreflight): number {
  const context = doc.context, objects = context.enumerateIndirectObjects()
  if (doc.isEncrypted || context.trailerInfo.Encrypt || objects.length > PDF_MAX_OBJECTS || objects.length !== preflight.objects.size || context.trailerInfo.Root?.toString() !== preflight.root) pdfFail('加密或对象／Root 在加载时发生恢复，拒绝继续。')
  if (!(doc.catalog instanceof PDFCatalog)) pdfFail('Catalog 类型无效。')
  let nodes = 0
  const direct = (object: PDFObject, depth: number): void => {
    if (depth > PDF_MAX_DEPTH || ++nodes > PDF_MAX_NODES) pdfFail('对象图超过安全范围。')
    if (object instanceof PDFRef) { if (!context.lookup(object)) pdfFail('间接引用缺失。'); return }
    if (object instanceof PDFName) { if (forbidden.has(object.decodeText())) pdfFail(`不支持 ${object.decodeText()} 功能。`); return }
    if (object instanceof PDFArray) { for (const child of object.asArray()) direct(child, depth + 1); return }
    if (object instanceof PDFRawStream) {
      if (object.dict.has(PDFName.of('F'))) pdfFail('不支持外部文件流。')
      direct(object.dict, depth + 1); return
    }
    if (object instanceof PDFDict) {
      for (const [name, value] of object.entries()) {
        const key = name.decodeText()
        if (forbidden.has(key) || key === 'A') pdfFail(`不支持 ${key}：交互、附件、导航、签名、层或标签结构。`)
        if (key === 'Trans') {
          const transition = context.lookup(value)
          if (!(transition instanceof PDFDict) || transition.keys().length) pdfFail('仅支持空 Trans 字典；不静默移除页面转场。')
        }
        if (key === 'Annots') {
          const annots = context.lookup(value)
          if (!(annots instanceof PDFArray) || annots.size()) pdfFail('不支持注释或链接；不会静默移除。')
        }
        direct(value, depth + 1)
      }
      return
    }
    if (object instanceof PDFNumber) { if (!Number.isFinite(object.asNumber()) || Math.abs(object.asNumber()) > 1_000_000_000) pdfFail('数值无效。'); return }
    if (!(object instanceof PDFString || object instanceof PDFHexString || object instanceof PDFBool || object === PDFNull)) pdfFail('包含未支持或无效对象。')
  }
  for (const [ref, object] of objects) {
    if (!preflight.objects.has(ref.toString())) pdfFail('加载对象与原始定义不匹配。')
    direct(object, 0)
  }
  const seen = new Set<PDFObject>()
  const walk = (ref: PDFObject | undefined, parent: PDFRef | undefined, depth: number): number => {
    if (!(ref instanceof PDFRef) || depth > 24) pdfFail('页树必须使用间接引用，且深度不超过 24。')
    const node = context.lookup(ref)
    if (!(node instanceof PDFPageTree || node instanceof PDFPageLeaf) || seen.has(node)) pdfFail('页树类型错误、重复页面或循环引用。')
    seen.add(node)
    if (node.get(PDFName.of('Parent'))?.toString() !== parent?.toString()) pdfFail('页树 Parent 不匹配。')
    const allowed = node instanceof PDFPageLeaf ? pageKeys : treeKeys
    for (const name of node.keys()) if (!allowed.has(name.decodeText())) pdfFail(`页面或页树包含不支持的 ${name.decodeText()}。`)
    if (node instanceof PDFPageLeaf) return 1
    const kids = context.lookup(node.get(PDFName.of('Kids'))), count = context.lookup(node.get(PDFName.of('Count')))
    if (!(kids instanceof PDFArray) || !(count instanceof PDFNumber) || kids.size() > 200 || count.asNumber() < 1 || count.asNumber() > 200) pdfFail('页树 Kids／Count 无效或超过 200 页。')
    let actual = 0
    for (const child of kids.asArray()) { actual += walk(child, ref, depth + 1); if (actual > 200) pdfFail('总页数超过 200。') }
    if (actual !== count.asNumber()) pdfFail('页树声明数量与实际不一致。')
    return actual
  }
  const count = walk(doc.catalog.get(PDFName.of('Pages')), undefined, 0)
  if (count < 1 || count > 200) pdfFail('仅支持 1–200 页文档。')
  return count
}
