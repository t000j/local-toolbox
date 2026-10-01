// Synthetic PDF graph/header/stream probes only. Actual font/JPEG decoding is tested
// separately by check-pdf-scan-render.mjs; this gate never executes those bytes.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript'), pdf = require('pdf-lib'), zlib = require('node:zlib')
const cache = new Map()
function load(name) { if (cache.has(name)) return cache.get(name); const e = {}; cache.set(name, e); new Function('exports', 'require', ts.transpileModule(fs.readFileSync(`src/tools/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(e, id => id.startsWith('.') ? load(id.slice(2)) : require(id)); return e }
const { auditPdfPreview } = load('pdfPreviewGate'), limits = load('pdfPreviewLimits'), n = pdf.PDFName.of
let checks = 0
const ok = doc => { auditPdfPreview(doc); checks++ }, bad = (doc, pattern) => { assert.throws(() => auditPdfPreview(doc), pattern); checks++ }
const text = value => new TextEncoder().encode(value)
const binary = text('BI 1 beginbfrange <000000> <ffffff> <0041> endbfrange')
// Tiny 3x2 synthetic Pillow JPEGs. Larger SOF edits below test admission bounds,
// not entropy validity or decoder success; none are sent to an image decoder.
const rgb = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDj6KKK+XP0c//Z', 'base64')
const gray = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/wAALCAACAAMBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APRa/9k=', 'base64')
function segment(jpeg, marker, data) { const h = Buffer.from([255, marker, (data.length + 2) >> 8, (data.length + 2) & 255]); return Buffer.concat([jpeg.subarray(0, 2), h, data, jpeg.subarray(2)]) }
function headerSize(jpeg, width, height) { const b = Buffer.from(jpeg), at = b.indexOf(Buffer.from([255, 192])); assert(at > 0); b.writeUInt16BE(height, at + 5); b.writeUInt16BE(width, at + 7); return b }
async function fixture() { const doc = await pdf.PDFDocument.create({ updateMetadata: false }), page = doc.addPage([100, 100]), xobjects = doc.context.obj({}), fonts = doc.context.obj({}), resources = doc.context.obj({ XObject: xobjects, Font: fonts }); page.node.set(n('Resources'), resources); page.node.set(n('Contents'), doc.context.register(doc.context.stream('q Q'))); return { doc, page, xobjects, fonts, resources } }
function image(f, bytes = new Uint8Array(18), props = {}) { const stream = f.doc.context.stream(bytes, { Type: 'XObject', Subtype: 'Image', Width: 3, Height: 2, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', ...props }), ref = f.doc.context.register(stream); f.xobjects.set(n(`Im${f.xobjects.keys().length}`), ref); return { stream, ref } }
function embedded(f, bytes = binary, kind = 'FontFile2', subtype = 'TrueType') { const stream = f.doc.context.stream(bytes, kind === 'FontFile3' ? { Subtype: 'Type1C' } : {}), ref = f.doc.context.register(stream), descriptor = f.doc.context.obj({ Type: 'FontDescriptor', [kind]: ref }), font = f.doc.context.obj({ Type: 'Font', Subtype: subtype, BaseFont: 'Synthetic', FontDescriptor: descriptor }); f.fonts.set(n('F1'), font); return { stream, ref, descriptor, font } }
async function main() {
  assert.equal(limits.PDF_PREVIEW_IMAGE_PIXELS, 12_000_000); assert.equal(limits.PDF_PREVIEW_TOTAL_IMAGE_PIXELS, 16_000_000); assert(limits.PDF_PREVIEW_TOTAL_IMAGE_PIXELS * 4 <= limits.PDF_PREVIEW_IMAGE_RGBA_BYTES); checks += 3
  for (const [bytes, color] of [[rgb, 'DeviceRGB'], [gray, 'DeviceGray']]) { const f = await fixture(); image(f, bytes, { Filter: 'DCTDecode', ColorSpace: color }); ok(f.doc); ok(await pdf.PDFDocument.load(await f.doc.save({ useObjectStreams: false }))) }
  { const f = await fixture(); image(f, segment(rgb, 254, Buffer.from(binary)), { Filter: 'DCTDecode' }); ok(f.doc) }
  { const f = await fixture(), b = Buffer.alloc(32); b.write('Exif\0\0', 0, 'binary'); b.write('II', 6); b.writeUInt16LE(42, 8); b.writeUInt32LE(8, 10); b.writeUInt16LE(1, 14); b.writeUInt16LE(274, 16); b.writeUInt16LE(3, 18); b.writeUInt32LE(1, 20); b.writeUInt16LE(6, 24); const img = image(f, segment(rgb, 225, b), { Filter: 'DCTDecode' }); ok(f.doc); img.stream.dict.set(n('Width'), pdf.PDFNumber.of(2)); img.stream.dict.set(n('Height'), pdf.PDFNumber.of(3)); bad(f.doc, /JPEG实际尺寸/) }
  for (const patch of [{ Width: 2 }, { ColorSpace: 'DeviceGray' }, { BitsPerComponent: 16 }, { Filter: 'JPXDecode' }, { Filter: ['FlateDecode', 'DCTDecode'] }, { DecodeParms: { ColorTransform: 0 } }, { ColorSpace: ['ICCBased', null] }, { ColorSpace: 'DeviceCMYK' }, { W: 3 }, { D: [0, 1] }, { SMaskInData: 1 }]) { const f = await fixture(); image(f, rgb, { Filter: 'DCTDecode', ...patch }); bad(f.doc) }
  for (const bytes of [rgb.subarray(1), rgb.subarray(0, -1), Buffer.concat([rgb, Buffer.from([0])])]) { const f = await fixture(); image(f, bytes, { Filter: 'DCTDecode' }); bad(f.doc) }
  { const f = await fixture(); f.doc.context.register(f.doc.context.stream(rgb, { Filter: 'DCTDecode' })); bad(f.doc, /缩略图/) }
  for (const compressed of [false, true]) { const f = await fixture(), raw = new Uint8Array(192); raw.set(binary); image(f, compressed ? zlib.deflateSync(raw) : raw, { Width: 8, Height: 8, ...(compressed ? { Filter: 'FlateDecode' } : {}) }); ok(f.doc) }
  for (const length of [17, 19]) { const f = await fixture(); image(f, new Uint8Array(length)); bad(f.doc, /长度/) }
  { const f = await fixture(); image(f, zlib.deflateSync(new Uint8Array(19)), { Filter: 'FlateDecode' }); bad(f.doc, /超过/) }
  for (const soft of [true, false]) for (const compressed of [true, false]) {
    const f = await fixture(), main = image(f), raw = new Uint8Array(soft ? 6 : 2).fill(73), mask = image(f, compressed ? zlib.deflateSync(raw) : raw, { BitsPerComponent: soft ? 8 : 1, ...(soft ? { ColorSpace: 'DeviceGray' } : { ImageMask: true }), ...(compressed ? { Filter: 'FlateDecode' } : {}), Decode: [1, 0] })
    if (!soft) mask.stream.dict.delete(n('ColorSpace'))
    f.xobjects.delete(n('Im1')); main.stream.dict.set(n(soft ? 'SMask' : 'Mask'), mask.ref); ok(f.doc)
    ok(await pdf.PDFDocument.load(await f.doc.save({ useObjectStreams: false })))
  }
  { const f = await fixture(), base = image(f), mask = image(f, gray, { Filter: 'DCTDecode', ColorSpace: 'DeviceGray' }); base.stream.dict.set(n('SMask'), mask.ref); bad(f.doc, /SMask/) }
  for (const patch of [{ Width: 2 }, { ColorSpace: 'DeviceRGB' }, { BitsPerComponent: 1 }, { ImageMask: true }, { Matte: [1, 1, 1] }]) { const f = await fixture(), base = image(f), mask = image(f, new Uint8Array(6), { ColorSpace: 'DeviceGray', ...patch }); base.stream.dict.set(n('SMask'), mask.ref); bad(f.doc) }
  { const f = await fixture(), base = image(f); base.stream.dict.set(n('SMask'), base.ref); bad(f.doc, /循环/) }
  { const f = await fixture(), base = image(f), mask = image(f, new Uint8Array(6), { ColorSpace: 'DeviceGray' }); base.stream.dict.set(n('SMask'), mask.ref); mask.stream.dict.set(n('SMask'), base.ref); bad(f.doc, /嵌套|循环/) }
  { const f = await fixture(), base = image(f), mask = image(f, new Uint8Array(6), { ColorSpace: 'DeviceGray' }); base.stream.dict.set(n('SMask'), mask.ref); base.stream.dict.set(n('Mask'), mask.ref); bad(f.doc, /同时/) }
  { const f = await fixture(), base = image(f); base.stream.dict.set(n('Mask'), f.doc.context.obj([0, 255, 0, 255, 0, 255])); bad(f.doc, /色键/) }
  { const f = await fixture(), base = image(f); base.stream.dict.set(n('SMask'), f.doc.context.register(f.doc.context.stream(new Uint8Array(6), { Width: 3, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }))); bad(f.doc, /SMask/) }
  for (const mutate of [
    (f, im) => f.page.node.set(n('Contents'), im.ref), (f, im) => f.page.node.set(n('Contents'), f.doc.context.obj([im.ref])),
    (f, im) => f.page.node.set(n('Metadata'), im.ref), (f, im) => f.doc.context.register(f.doc.context.obj({ ToUnicode: im.ref })),
    (f, im) => f.doc.context.assign(f.doc.context.nextRef(), im.ref), (f, im) => f.doc.catalog.set(n('Extra'), f.doc.context.obj([[im.ref]])),
    f => f.page.node.set(n('PieceInfo'), f.resources), f => f.resources.set(n('Font'), f.xobjects)
  ]) { const f = await fixture(), im = image(f); mutate(f, im); bad(f.doc, /角色|别名/) }
  { const f = await fixture(); image(f); f.xobjects.delete(n('Im0')); bad(f.doc, /角色/) }
  { const f = await fixture(); image(f); f.xobjects.set(n('Also'), f.xobjects.get(n('Im0'))); ok(f.doc) }
  { const f = await fixture(); image(f); const tree = f.doc.context.lookup(f.page.node.get(n('Parent'))); tree.set(n('Resources'), f.resources); f.page.node.delete(n('Resources')); ok(f.doc) }
  { const f = await fixture(); image(f); embedded(f); const form = f.doc.context.register(f.doc.context.stream('/Im0 Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 3, 2], Resources: f.resources })); f.page.node.set(n('Resources'), f.doc.context.obj({ XObject: { Form: form } })); ok(f.doc) }
  { const f = await fixture(); image(f); const form = f.doc.context.register(f.doc.context.stream('/Im0 Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 3, 2], Resources: f.resources })); f.xobjects.set(n('Loop'), form); bad(f.doc, /循环/) }
  { const f = await fixture(); image(f); for (let i = 0; i < 12; i++) { const resource = f.page.node.get(n('Resources')), form = f.doc.context.register(f.doc.context.stream('q Q', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 3, 2], Resources: resource })); f.page.node.set(n('Resources'), f.doc.context.obj({ XObject: { Form: form } })) }; bad(f.doc, /深度/) }
  for (const kind of ['FontFile', 'FontFile2', 'FontFile3']) { const f = await fixture(); embedded(f, binary, kind, kind === 'FontFile2' ? 'TrueType' : 'Type1'); ok(f.doc); ok(await pdf.PDFDocument.load(await f.doc.save({ useObjectStreams: false }))) }
  { const f = await fixture(), font = embedded(f, binary, 'FontFile2', 'CIDFontType2'); f.fonts.set(n('F1'), f.doc.context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'Synthetic', Encoding: 'Identity-H', DescendantFonts: [font.font] })); ok(f.doc) }
  for (const mutate of [
    (f, font) => f.page.node.set(n('Contents'), font.ref), (f, font) => f.page.node.set(n('Contents'), f.doc.context.register(f.doc.context.obj([font.ref]))),
    (f, font) => font.font.set(n('ToUnicode'), font.ref), (f, font) => f.doc.context.register(f.doc.context.obj({ Metadata: font.ref })),
    (f, font) => f.doc.context.assign(f.doc.context.nextRef(), font.ref), (f, font) => f.doc.catalog.set(n('Extra'), f.doc.context.obj([font.descriptor])),
    f => f.page.node.set(n('Contents'), f.fonts), f => f.page.node.set(n('PieceInfo'), f.resources)
  ]) { const f = await fixture(), font = embedded(f); mutate(f, font); bad(f.doc, /FontFile.*BI\/CMap/) }
  { const f = await fixture(), font = embedded(f, binary, 'FontFile3', 'Type1'); font.stream.dict.set(n('Subtype'), n('Unknown')); bad(f.doc, /FontFile/) }
  { const f = await fixture(), font = embedded(f); font.font.set(n('ToUnicode'), f.doc.context.register(f.doc.context.stream('1 beginbfrange <000000> <ffffff> <0041> endbfrange'))); bad(f.doc, /CMap/) }
  for (const value of ['BI /W 999999 /H 999999 ID x EI', '1 beginbfrange <000000> <ffffff> <0041> endbfrange']) { const f = await fixture(); f.doc.context.register(f.doc.context.stream(value)); bad(f.doc, /BI|CMap/) }
  for (const key of ['FunctionType', 'PatternType', 'ShadingType', 'UseCMap', 'SMask', 'Mask']) { const f = await fixture(); f.doc.context.register(f.doc.context.obj({ [key]: 0 })); bad(f.doc, /过程/) }
  for (const size of [limits.PDF_PREVIEW_FONT_BYTES, limits.PDF_PREVIEW_FONT_BYTES + 1]) { const f = await fixture(); embedded(f, new Uint8Array(size)); size === limits.PDF_PREVIEW_FONT_BYTES ? ok(f.doc) : bad(f.doc, /4MiB/) }
  { const f = await fixture(); embedded(f, zlib.deflateSync(new Uint8Array(limits.PDF_PREVIEW_FONT_BYTES + 1))).stream.dict.set(n('Filter'), n('FlateDecode')); bad(f.doc, /超过/) }
  { const f = await fixture(); for (let i = 0; i < 4; i++) image(f, headerSize(gray, 2000, 2000), { Width: 2000, Height: 2000, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); ok(f.doc); image(f, gray, { ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); bad(f.doc, /1600万/) }
  { const f = await fixture(); for (let i = 0; i < 2; i++) image(f, headerSize(rgb, 2000, 2000), { Width: 2000, Height: 2000, Filter: 'DCTDecode' }); ok(f.doc); image(f, headerSize(rgb, 2000, 2000), { Width: 2000, Height: 2000, Filter: 'DCTDecode' }); bad(f.doc, /总量/) }
  { const f = await fixture(); image(f, headerSize(gray, 4096, 1), { Width: 4096, Height: 1, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); ok(f.doc); image(f, headerSize(gray, 4097, 1), { Width: 4097, Height: 1, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); bad(f.doc, /尺寸/) }
  { const f = await fixture(); for (let i = 0; i < 2000; i++) f.doc.context.register(f.doc.context.stream('')); bad(f.doc, /2000/) }
  { const f = await fixture(), list = f.doc.context.obj([]); for (let i = 0; i <= 100_000; i++) list.push(pdf.PDFNull); f.doc.catalog.set(n('Extra'), list); bad(f.doc, /上限/) }
  { const f = await fixture(); image(f, headerSize(gray, 4000, 3000), { Width: 4000, Height: 3000, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); ok(f.doc) }
  { const f = await fixture(); image(f, headerSize(gray, 4000, 3001), { Width: 4000, Height: 3001, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); bad(f.doc, /尺寸/) }
  { const f = await fixture(); image(f, headerSize(rgb, 2480, 3508), { Width: 2480, Height: 3508, Filter: 'DCTDecode' }); ok(f.doc) }
  { const f = await fixture(); const form = f.doc.context.register(f.doc.context.stream('q Q', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 3, 2], Resources: f.resources })); f.xobjects.set(n('Loop'), form); bad(f.doc, /循环/) }
  { const f = await fixture(); f.resources.set(n('ColorSpace'), f.doc.context.obj({ Exotic: ['Pattern', 'DeviceRGB'] })); bad(f.doc, /ColorSpace/) }
  { const f = await fixture(); f.resources.set(n('ColorSpace'), f.doc.context.obj({ RGB: 'DeviceRGB' })); ok(f.doc) }
  { const f = await fixture(); f.xobjects.set(n('Unknown'), f.doc.context.register(f.doc.context.stream('q Q', { Subtype: 'Unrecognized' }))); bad(f.doc, /XObject/) }
  { const f = await fixture(); f.xobjects.set(n('NotStream'), f.doc.context.obj({ Subtype: 'Image' })); bad(f.doc, /XObject/) }
  // Combined pixel accounting includes masks, even when they are not XObjects.
  { const f = await fixture(); const bytes = zlib.deflateSync(new Uint8Array(4_000_000)); for (let i = 0; i < 2; i++) { const base = image(f, bytes, { Width: 2000, Height: 2000, ColorSpace: 'DeviceGray', Filter: 'FlateDecode' }), mask = image(f, bytes, { Width: 2000, Height: 2000, ColorSpace: 'DeviceGray', Filter: 'FlateDecode' }); base.stream.dict.set(n('SMask'), mask.ref); f.xobjects.delete(n(`Im${f.xobjects.keys().length - 1}`)) }; ok(f.doc); image(f, gray, { ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); bad(f.doc, /1600万/) }
  { const f = await fixture(), b = new Uint8Array(3_000_000); for (let i = 0; i < 12; i++) f.doc.context.register(f.doc.context.stream(zlib.deflateSync(b), { Filter: 'FlateDecode' })); bad(f.doc, /超过/) }
  { const f = await fixture(); const im = image(f); im.stream.dict.set(n('SMask'), n('None')); ok(f.doc); im.stream.dict.set(n('Mask'), n('None')); bad(f.doc, /Mask/) }
  { const f = await fixture(); for (let i = 0; i < 2; i++) image(f, headerSize(gray, 4000, 3000), { Width: 4000, Height: 3000, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' }); bad(f.doc, /RGBA/) }
  { const f = await fixture(); for (let i = 0; i < 1999; i++) f.doc.context.register(f.doc.context.stream('')); ok(f.doc) }
  console.log(`${checks} synthetic PDF image/font/mask roles, header, alias and shared-budget checks passed; no real PDF, browser or native dialog used`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
