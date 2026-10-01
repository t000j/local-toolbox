import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFPageLeaf, PDFPageTree, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib'
import { PDF_MAX_NODES, PDF_MAX_OBJECTS, pdfFail } from './pdfRawSyntax'

interface Incoming { owner?: PDFObject; key?: string; kind: 'dict' | 'array' | 'stream' | 'alias' | 'trailer' }

/** On an already admitted document, prove a conservative direct-page-only image subset.
 * A stream's /Subtype is not proof of its use: the same object can also be Contents,
 * ToUnicode, Metadata, etc. Inspect every reference, including unreachable objects,
 * and reject aliases of both the image and its Resources/XObject containers.
 */
export function safeImageStreams(doc: PDFDocument): Set<PDFRawStream> {
  const incoming = new Map<PDFObject, Incoming[]>(), visited = new Set<PDFObject>(), pending: PDFObject[] = []
  const objects = doc.context.enumerateIndirectObjects()
  if (objects.length > PDF_MAX_OBJECTS) pdfFail('图片角色检查的对象数量超限。')
  let edges = 0
  const link = (value: PDFObject, edge: Incoming): void => {
    if (++edges > PDF_MAX_NODES) pdfFail('图片角色检查的引用数量超限。')
    const target = value instanceof PDFRef ? doc.context.lookup(value) : value
    if (!target) pdfFail('图片角色检查发现缺失引用。')
    const uses = incoming.get(target)
    if (uses) uses.push(edge); else incoming.set(target, [edge])
    pending.push(target)
  }
  // An indirect-object definition is storage, not a semantic incoming use.
  for (const [, object] of objects) pending.push(object)
  for (const [key, value] of Object.entries(doc.context.trailerInfo)) if (value) link(value, { kind: 'trailer', key })
  while (pending.length) {
    const object = pending.pop()!
    if (visited.has(object)) continue
    visited.add(object)
    if (visited.size > PDF_MAX_NODES) pdfFail('图片角色检查的节点数量超限。')
    if (object instanceof PDFRef) link(object, { kind: 'alias', owner: object })
    else if (object instanceof PDFStream) link(object.dict, { kind: 'stream', owner: object })
    else if (object instanceof PDFDict) for (const [key, value] of object.entries()) link(value, { kind: 'dict', owner: object, key: key.decodeText() })
    else if (object instanceof PDFArray) for (const value of object.asArray()) link(value, { kind: 'array', owner: object })
  }

  const resources = new Set<PDFDict>(), owners = new Map<PDFDict, PDFDict>(), pages = doc.getPages()
  if (pages.length > 200) pdfFail('图片角色检查的页数超限。')
  for (const page of pages) {
    const ancestors = new Set<PDFDict>(); let node: PDFObject | undefined = page.node
    while (node) {
      if (!(node instanceof PDFPageLeaf || node instanceof PDFPageTree) || ancestors.has(node) || ancestors.size >= 25) pdfFail('图片角色检查的页树无效。')
      ancestors.add(node)
      const value = node.get(PDFName.of('Resources'))
      if (value) {
        const resource = doc.context.lookup(value)
        if (resource instanceof PDFDict) { resources.add(resource); owners.set(node, resource) }
        break
      }
      node = doc.context.lookup(node.get(PDFName.of('Parent')))
    }
  }
  const only = (object: PDFObject, permitted: (edge: Incoming) => boolean): boolean => {
    const uses = incoming.get(object)
    return !!uses?.length && uses.every(permitted)
  }
  const safeResources = new Set([...resources].filter(resource => only(resource, edge => edge.kind === 'dict' && edge.key === 'Resources' && edge.owner instanceof PDFDict && owners.get(edge.owner) === resource)))
  const xObjects = new Set<PDFDict>()
  for (const resource of safeResources) {
    const value = doc.context.lookup(resource.get(PDFName.of('XObject')))
    if (value instanceof PDFDict) xObjects.add(value)
  }
  const safeXObjects = new Set([...xObjects].filter(xObject => only(xObject, edge => edge.kind === 'dict' && edge.key === 'XObject' && edge.owner instanceof PDFDict && safeResources.has(edge.owner))))
  const images = new Set<PDFRawStream>(), examined = new Set<PDFRawStream>()
  for (const xObject of safeXObjects) for (const value of xObject.values()) {
    const image = doc.context.lookup(value)
    if (!(image instanceof PDFRawStream) || examined.has(image)) continue
    examined.add(image)
    if (doc.context.lookup(image.dict.get(PDFName.of('Subtype')))?.toString() === '/Image' && only(image, edge => edge.kind === 'dict' && edge.owner instanceof PDFDict && safeXObjects.has(edge.owner))) images.add(image)
  }
  return images
}
