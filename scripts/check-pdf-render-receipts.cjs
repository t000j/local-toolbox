// Resolved render-resource fixtures only; no PDF.js or actual browser rendering.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const constants = {}, e = {}
new Function('exports', compile(fs.readFileSync('src/tools/pdfPreviewLimits.ts', 'utf8')))(constants)
new Function('exports', 'require', compile(fs.readFileSync('src/tools/pdfRenderImages.ts', 'utf8')))(e, () => constants)
let checks = 0
const good = object => { e.verifyPdfRenderImages(object); checks++ }, bad = object => { assert.throws(() => e.verifyPdfRenderImages(object)); checks++ }
const page = (images, common = []) => ({ objs: new Map(images.map((value, i) => [`img_${i}`, value])), commonObjs: new Map(common.map((value, i) => [`g_${i}`, value])) })
const image = (kind = 2) => ({ width: 2, height: 2, kind, data: new Uint8Array(kind === 1 ? 2 : kind === 2 ? 12 : 16) })
good(page([])); good(page([image()])); good(page([image(1)])); good(page([image(3)])); good(page([{ width: 2, height: 2, data: new Uint8Array(2) }]))
good(page([], [{ loadedName: 'font', data: new Uint8Array([1]) }]))
for (const value of [null, undefined]) { bad(page([value])); bad(page([], [value])) }
for (const width of [0, -1, 4097, Infinity, NaN, 1.2]) bad(page([{ ...image(), width }]))
for (const data of [undefined, null, [], new Uint8Array(11), new Uint8Array(13), new Uint16Array(6), new DataView(new ArrayBuffer(12))]) bad(page([{ ...image(), data }]))
for (const patch of [{ kind: 8 }, { bitmap: {} }, { height: 4097 }, { width: 4000, height: 3001, data: new Uint8Array(0) }]) bad(page([{ ...image(), ...patch }]))
const shared = image(); good(page([shared, shared], [shared]))
// No giant allocation: sparse source-shaped views are intentionally NOT allowed.
bad(page([{ width: 4000, height: 3000, kind: 3, data: { byteLength: 48000000, BYTES_PER_ELEMENT: 1 } }]))
for (const name of ['pdfThumbnails', 'pdfRasterRenderer']) {
  const source = fs.readFileSync(`src/tools/${name}.ts`, 'utf8')
  assert.ok(source.includes('verifyPdfRenderImages(page)')); checks++
  assert.ok(source.indexOf('verifyPdfRenderImages(page)') < source.indexOf(name === 'pdfThumbnails' ? 'canvas!.toBlob' : 'convertToBlob')); checks++
  assert.ok(source.includes('isImageDecoderSupported: false')); checks++
}
assert.ok(!fs.readFileSync('src/tools/pdfRenderImages.ts', 'utf8').includes('await page.getOperatorList')); checks++
console.log(`${checks} render-resource omission, dimensions, byte-receipt and publication-order assertions passed. Actual rendering tested separately.`)
