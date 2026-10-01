// Synthetic objects only; no output files, browser, or real documents.
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict'), pdf = require('pdf-lib')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}; cache.set(name, exports)
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(`src/tools/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, id => id.startsWith('.') ? load(id.slice(2)) : require(id))
  return exports
}
const { safeImageStreams } = load('pdfImageRoles'), n = pdf.PDFName.of
let checks = 0
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
async function fixture() {
  const doc = await pdf.PDFDocument.create({ updateMetadata: false }), page = doc.addPage([500, 400])
  const bytes = new Uint8Array(384 * 256 * 3).fill(32)
  bytes.set(new TextEncoder().encode('1 0 0 rg 0 0 500 400 re f\n'))
  const image = pdf.PDFRawStream.of(doc.context.obj({ Type: 'XObject', Subtype: 'Image', Width: 384, Height: 256, BitsPerComponent: 8, ColorSpace: 'DeviceRGB' }), bytes)
  const imageRef = doc.context.register(image), xObjects = doc.context.obj({ Im: imageRef }), xObjectsRef = doc.context.register(xObjects)
  const resources = doc.context.obj({ XObject: xObjectsRef }), resourcesRef = doc.context.register(resources)
  page.node.set(n('Resources'), resourcesRef)
  page.node.set(n('Contents'), doc.context.register(doc.context.stream('q 384 0 0 256 0 0 cm /Im Do Q')))
  return { doc, page, image, imageRef, resources, resourcesRef, xObjects, xObjectsRef }
}
async function check(name, mutate, expected) {
  const f = await fixture(); await mutate(f)
  eq(safeImageStreams(f.doc).has(f.image), expected)
  // Repeat after serialization so direct/indirect object identity is realistic.
  const restored = await pdf.PDFDocument.load(await f.doc.save({ useObjectStreams: false, updateFieldAppearances: false }), { updateMetadata: false })
  eq(safeImageStreams(restored).size, expected ? 1 : 0)
  console.log(`ok ${name}`)
}
async function main() {
  await check('genuine direct page image', () => {}, true)
  await check('image reused under another image name', f => f.xObjects.set(n('Second'), f.imageRef), true)
  await check('image shared by independent page resources', f => f.doc.addPage([500, 400]).node.set(n('Resources'), f.doc.context.obj({ XObject: { Im2: f.imageRef } })), true)
  await check('shared page resources', f => f.doc.addPage([500, 400]).node.set(n('Resources'), f.resourcesRef), true)
  await check('inherited page resources', f => { const tree = f.doc.context.lookup(f.page.node.get(n('Parent'))); tree.set(n('Resources'), f.resourcesRef); f.page.node.delete(n('Resources')) }, true)
  await check('image aliases single Contents', f => f.page.node.set(n('Contents'), f.imageRef), false)
  await check('image aliases Contents array', f => f.page.node.set(n('Contents'), f.doc.context.obj([f.imageRef])), false)
  await check('image aliases indirect Contents array', f => f.page.node.set(n('Contents'), f.doc.context.register(f.doc.context.obj([f.imageRef]))), false)
  await check('image aliases Metadata', f => f.page.node.set(n('Metadata'), f.imageRef), false)
  await check('image aliases font ToUnicode', f => f.resources.set(n('Font'), f.doc.context.obj({ F1: { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', ToUnicode: f.imageRef } })), false)
  await check('image aliases nested array', f => f.doc.catalog.set(n('Extra'), f.doc.context.obj([[f.imageRef]])), false)
  await check('image aliases unreachable object', f => { f.doc.context.register(f.doc.context.obj({ Metadata: f.imageRef })) }, false)
  await check('image aliases thumbnail', f => f.page.node.set(n('Thumb'), f.imageRef), false)
  await check('Resources aliases another role', f => f.page.node.set(n('PieceInfo'), f.resourcesRef), false)
  await check('Resources aliases array entry', f => f.doc.catalog.set(n('Extra'), f.doc.context.obj([f.resourcesRef])), false)
  await check('XObject dictionary aliases font role', f => f.resources.set(n('Font'), f.xObjectsRef), false)
  await check('XObject dictionary aliases Metadata', f => f.doc.catalog.set(n('Metadata'), f.xObjectsRef), false)
  await check('XObject dictionary aliases array entry', f => f.doc.catalog.set(n('Extra'), f.doc.context.obj([f.xObjectsRef])), false)
  await check('XObject dictionary shared across recognized resources', f => f.doc.addPage([500, 400]).node.set(n('Resources'), f.doc.context.obj({ XObject: f.xObjectsRef })), true)
  await check('container alias poisons shared image across clean resources', f => {
    f.doc.addPage([500, 400]).node.set(n('Resources'), f.doc.context.obj({ XObject: { Im2: f.imageRef } }))
    f.page.node.set(n('PieceInfo'), f.resourcesRef)
  }, false)
  await check('Resources shared with Form is skipped', f => {
    const form = f.doc.context.stream('/Im Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 384, 256], Resources: f.resourcesRef })
    f.doc.context.register(form)
  }, false)
  await check('image only in Form resources is skipped', f => {
    const form = f.doc.context.stream('/Im Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 384, 256], Resources: f.resourcesRef })
    f.page.node.set(n('Resources'), f.doc.context.obj({ XObject: { Form: f.doc.context.register(form) } }))
  }, false)
  await check('orphan image is skipped', f => f.xObjects.delete(n('Im')), false)
  const direct = await fixture()
  direct.page.node.set(n('Resources'), direct.resources); direct.resources.set(n('XObject'), direct.xObjects)
  eq(safeImageStreams(direct.doc).has(direct.image), true)
  const repeated = await fixture()
  for (let i = 0; i < 10_000; i++) repeated.xObjects.set(n(`Alias${i}`), repeated.imageRef)
  eq(safeImageStreams(repeated.doc).size, 1)
  repeated.page.node.set(n('Metadata'), repeated.imageRef)
  eq(safeImageStreams(repeated.doc).size, 0)
  const f = await fixture(), array = f.doc.context.obj([])
  for (let i = 0; i < 100_001; i++) array.push(pdf.PDFNull)
  f.doc.catalog.set(n('Extra'), array)
  assert.throws(() => safeImageStreams(f.doc), /引用数量超限/); checks++
  const alias = await fixture(); alias.doc.context.assign(alias.doc.context.nextRef(), alias.imageRef)
  eq(safeImageStreams(alias.doc).size, 0)
  console.log(`${checks} image-only stream role/alias/bounds checks passed`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
