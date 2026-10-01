import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib'
import { PDF_MAX_DEPTH, PDF_MAX_NODES, PDF_MAX_OBJECTS, pdfFail } from './pdfRawSyntax'

interface Incoming { owner?: PDFObject; key?: string; kind: 'dict' | 'array' | 'stream' | 'alias' | 'trailer' }
type Role = 'resources' | 'xobjects' | 'form' | 'image' | 'fonts' | 'font' | 'descendants' | 'descriptor' | 'fontFile'

/** Binary bytes are exempt from textual BI/CMap scanning only when *every* incoming
 * use is a recognized binary role, anchored at audited page resources. Checking
 * container uses too prevents a shared font/XObject dictionary becoming Contents.
 * Definitions are not uses; unreachable references and indirect aliases are uses.
 */
export function pdfPreviewRoles(doc: PDFDocument): { images: Set<PDFRawStream>; fonts: Set<PDFRawStream>; streams: Set<PDFRawStream> } {
  const incoming = new Map<PDFObject, Incoming[]>(), visited = new Set<PDFObject>(), pending: PDFObject[] = []
  const objects = doc.context.enumerateIndirectObjects()
  if (objects.length > PDF_MAX_OBJECTS) pdfFail('缩略图资源对象数量超过上限。')
  let edges = 0
  const get = (dict: PDFDict, key: string) => doc.context.lookup(dict.get(PDFName.of(key)))
  const name = (dict: PDFDict, key: string) => { const value = get(dict, key); return value instanceof PDFName ? value.decodeText() : undefined }
  const link = (value: PDFObject, edge: Incoming): void => {
    if (++edges > PDF_MAX_NODES) pdfFail('缩略图资源引用数量超过上限。')
    const target = value instanceof PDFRef ? doc.context.lookup(value) : value
    if (!target) pdfFail('缩略图资源引用缺失。')
    const uses = incoming.get(target)
    if (uses) uses.push(edge); else incoming.set(target, [edge])
    pending.push(target)
  }
  for (const [, object] of objects) pending.push(object)
  for (const [key, value] of Object.entries(doc.context.trailerInfo)) if (value) link(value, { kind: 'trailer', key })
  const streams = new Set<PDFRawStream>(), fontFiles = new Set<PDFRawStream>()
  while (pending.length) {
    const object = pending.pop()!
    if (visited.has(object)) continue
    visited.add(object)
    if (visited.size > PDF_MAX_NODES) pdfFail('缩略图资源节点数量超过上限。')
    if (object instanceof PDFRef) link(object, { kind: 'alias', owner: object })
    else if (object instanceof PDFStream) {
      if (!(object instanceof PDFRawStream)) pdfFail('缩略图资源流类型无效。')
      streams.add(object); link(object.dict, { kind: 'stream', owner: object })
    } else if (object instanceof PDFDict) for (const [key, value] of object.entries()) {
      const keyName = key.decodeText()
      link(value, { kind: 'dict', owner: object, key: keyName })
      if (['FontFile', 'FontFile2', 'FontFile3'].includes(keyName)) {
        const file = get(object, keyName)
        if (!(file instanceof PDFRawStream)) pdfFail('缩略图嵌入字体FontFile必须是资源流。')
        fontFiles.add(file)
      }
    } else if (object instanceof PDFArray) for (const value of object.asArray()) link(value, { kind: 'array', owner: object })
  }
  const pageOwners = new Set<PDFDict>()
  for (const page of doc.getPages()) {
    const ancestors = new Set<PDFDict>(); let node: PDFObject | undefined = page.node
    while (node) {
      if (!(node instanceof PDFPageLeaf || node instanceof PDFPageTree) || ancestors.has(node) || ancestors.size >= 25) pdfFail('缩略图页树循环或深度超限。')
      ancestors.add(node); pageOwners.add(node)
      node = get(node, 'Parent')
    }
  }
  // A memo stores proof height, not just true: reusing a shallow proof cannot hide
  // an over-depth path. Active roles reject recursive Form/resource/mask cycles.
  const memo = new Map<Role, Map<PDFObject, number>>(), active = new Map<Role, Set<PDFObject>>()
  const prove = (role: Role, object: PDFObject, depth = 0): number => {
    if (depth > PDF_MAX_DEPTH) pdfFail('缩略图资源角色深度超过32。')
    const cached = memo.get(role)?.get(object)
    if (cached !== undefined) {
      if (cached >= 0 && cached + depth > PDF_MAX_DEPTH) pdfFail('缩略图资源角色深度超过32。')
      return cached
    }
    const working = active.get(role) ?? new Set<PDFObject>(); active.set(role, working)
    if (working.has(object)) pdfFail('缩略图资源存在循环引用。')
    working.add(object)
    let height = 0
    const child = (next: Role, value: PDFObject | undefined): boolean => {
      if (!value) return false
      const h = prove(next, value, depth + 1)
      if (h < 0) return false
      height = Math.max(height, h + 1); return true
    }
    const only = (test: (edge: Incoming) => boolean): boolean => {
      const uses = incoming.get(object)
      return !!uses?.length && uses.every(test)
    }
    const dictEdge = (edge: Incoming, key: string, next: Role): boolean => edge.kind === 'dict' && edge.key === key && !!edge.owner && child(next, edge.owner)
    const streamOwner = (dict: PDFObject, next: Role): boolean => {
      const uses = incoming.get(dict)
      return !!uses?.length && uses.every(edge => edge.kind === 'stream' && !!edge.owner && child(next, edge.owner))
    }
    let valid = false
    if (role === 'resources') valid = object instanceof PDFDict && only(edge => edge.kind === 'dict' && edge.key === 'Resources' && edge.owner instanceof PDFDict && (pageOwners.has(edge.owner) || streamOwner(edge.owner, 'form')))
    else if (role === 'xobjects') valid = object instanceof PDFDict && only(edge => dictEdge(edge, 'XObject', 'resources'))
    else if (role === 'form') valid = object instanceof PDFRawStream && name(object.dict, 'Subtype') === 'Form' && only(edge => edge.kind === 'dict' && !!edge.owner && child('xobjects', edge.owner))
    else if (role === 'image') valid = object instanceof PDFRawStream && name(object.dict, 'Subtype') === 'Image' && only(edge => edge.kind === 'dict' && !!edge.owner && (['SMask', 'Mask'].includes(edge.key ?? '') && streamOwner(edge.owner, 'image') || child('xobjects', edge.owner)))
    else if (role === 'fonts') valid = object instanceof PDFDict && only(edge => dictEdge(edge, 'Font', 'resources'))
    else if (role === 'font') {
      const subtype = object instanceof PDFDict ? name(object, 'Subtype') : undefined
      valid = object instanceof PDFDict && name(object, 'Type') === 'Font' && ['Type0', 'Type1', 'TrueType', 'CIDFontType0', 'CIDFontType2'].includes(subtype ?? '') && only(edge => subtype?.startsWith('CIDFont') ? edge.kind === 'array' && !!edge.owner && child('descendants', edge.owner) : edge.kind === 'dict' && !!edge.owner && child('fonts', edge.owner))
    } else if (role === 'descendants') valid = object instanceof PDFArray && object.size() === 1 && only(edge => edge.owner instanceof PDFDict && name(edge.owner, 'Subtype') === 'Type0' && dictEdge(edge, 'DescendantFonts', 'font'))
    else if (role === 'descriptor') valid = object instanceof PDFDict && name(object, 'Type') === 'FontDescriptor' && only(edge => edge.owner instanceof PDFDict && name(edge.owner, 'Subtype') !== 'Type0' && dictEdge(edge, 'FontDescriptor', 'font'))
    else if (role === 'fontFile') valid = object instanceof PDFRawStream && only(edge => {
      if (edge.kind !== 'dict' || !(edge.owner instanceof PDFDict) || !['FontFile', 'FontFile2', 'FontFile3'].includes(edge.key ?? '') || !child('descriptor', edge.owner)) return false
      const subtype = name(object.dict, 'Subtype')
      return edge.key === 'FontFile3' ? ['Type1C', 'CIDFontType0C', 'OpenType'].includes(subtype ?? '') : subtype === undefined
    })
    working.delete(object)
    const result = valid ? height : -1, cache = memo.get(role) ?? new Map<PDFObject, number>()
    cache.set(object, result); memo.set(role, cache)
    if (result >= 0 && depth + result > PDF_MAX_DEPTH) pdfFail('缩略图资源角色深度超过32。')
    return result
  }
  const images = new Set<PDFRawStream>(), fonts = new Set<PDFRawStream>()
  for (const stream of streams) {
    const subtype = name(stream.dict, 'Subtype')
    if (subtype === 'Image' && prove('image', stream) >= 0) images.add(stream)
    if (subtype === 'Form' && prove('form', stream) < 0) pdfFail('缩略图Form角色或别名不受支持。')
  }
  for (const stream of fontFiles) if (prove('fontFile', stream) >= 0) fonts.add(stream)
  // Font aliases must not turn binary BI/CMap lookalikes into unscanned page text.
  for (const stream of fontFiles) if (!fonts.has(stream)) pdfFail('缩略图FontFile角色或别名不受支持，不能绕过BI/CMap检查。')
  return { images, fonts, streams }
}
