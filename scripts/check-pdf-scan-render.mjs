// Real PDF.js + native canvas on generated scans/alpha/font fixtures. No user files.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url), ts = require('typescript'), pdf = require('pdf-lib'), canvas = require('@napi-rs/canvas')
const out = '/tmp/local-toolbox-pdf-scan-check'; fs.mkdirSync(out, { recursive: true })
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D })
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    const c = canvas.createCanvas(width, height)
    c.convertToBlob = async ({ type, quality }) => new Blob([await c.encode(type === 'image/png' ? 'png' : 'jpeg', Math.round((quality ?? .9) * 100))], { type })
    return c
  }
}
await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
const api = await import('pdfjs-dist/legacy/build/pdf.mjs'), cache = new Map()
const fonts = Object.fromEntries(fs.readdirSync('node_modules/pdfjs-dist/standard_fonts').filter(n => /\.(pfb|ttf)$/.test(n))
  .map(n => [`/node_modules/pdfjs-dist/standard_fonts/${n}`, path.resolve('node_modules/pdfjs-dist/standard_fonts', n)]))
const previousFetch = globalThis.fetch
globalThis.fetch = async url => { assert.ok(String(url).startsWith(path.resolve('node_modules/pdfjs-dist/standard_fonts') + path.sep)); return new Response(fs.readFileSync(url)) }
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const e = {}; cache.set(name, e)
  const source = fs.readFileSync(`src/tools/${name}.ts`, 'utf8').replace(/import\.meta\.glob\([^\n]+?\) as Record<string, string>/, JSON.stringify(fonts))
  new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(e,
    id => id.endsWith('pdf.worker.mjs') ? {} : id.endsWith('/pdf.mjs') ? api : id.startsWith('.') ? load(id.slice(2)) : require(id))
  return e
}
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = v => { assert.ok(v); checks++ }
const write = (name, bytes) => fs.writeFileSync(path.join(out, name), bytes)
async function drawFixture() {
  const doc = await pdf.PDFDocument.create({ updateMetadata: false })
  const c = canvas.createCanvas(2480, 3508), ctx = c.getContext('2d')
  ctx.scale(2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#16476d'; ctx.fillRect(60, 60, 1100, 200); ctx.fillStyle = '#fff'; ctx.font = '72px sans-serif'; ctx.fillText('SYNTHETIC SCAN', 90, 185)
  ctx.fillStyle = '#edbd49'; ctx.fillRect(150, 450, 900, 650); ctx.fillStyle = '#222'; ctx.font = '50px sans-serif'; ctx.fillText('JPEG 2480 x 3508', 180, 1350)
  const jpeg = new Uint8Array(await c.encode('jpeg', 85)), scan = await doc.embedJpg(jpeg)
  doc.addPage([595.2, 841.92]).drawImage(scan, { x: 0, y: 0, width: 595.2, height: 841.92 })
  const alpha = canvas.createCanvas(64, 64), ac = alpha.getContext('2d')
  const data = ac.createImageData(64, 64)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; data.data.set([220, 30, 70, x * 4], i) }
  ac.putImageData(data, 0, 0)
  const png = await doc.embedPng(new Uint8Array(await alpha.encode('png')))
  const p = doc.addPage([200, 200]); p.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: pdf.rgb(.2, .6, .8) }); p.drawImage(png, { x: 20, y: 20, width: 160, height: 160 })
  const mask = doc.context.register(doc.context.flateStream(new Uint8Array([0xaa, 0x55, 0xaa, 0x55]), { Type: 'XObject', Subtype: 'Image', Width: 8, Height: 4, ImageMask: true, BitsPerComponent: 1 }))
  const pixels = new Uint8Array(8 * 4 * 3); for (let i = 0; i < pixels.length; i += 3) pixels.set([40, 180, 80], i)
  const im = doc.context.register(doc.context.flateStream(pixels, { Type: 'XObject', Subtype: 'Image', Width: 8, Height: 4, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Mask: mask }))
  const masked = doc.addPage([160, 80]); masked.node.set(pdf.PDFName.of('Resources'), doc.context.obj({ XObject: { Fixture: im } }))
  masked.node.set(pdf.PDFName.of('Contents'), doc.context.register(doc.context.flateStream('q 160 0 0 80 0 0 cm /Fixture Do Q')))
  return new Uint8Array(await doc.save({ useObjectStreams: false }))
}
try {
  const source = await drawFixture(), original = source.slice(); write('scan-source.pdf', source)
  const { loadPageDocument, exportPdfPages } = load('pdfPages'), { auditPdfPreview } = load('pdfPreviewGate')
  auditPdfPreview(await loadPageDocument(source)); checks++
  const sorted = await exportPdfPages(source, [3, 1, 2]); write('scan-sorted.pdf', sorted.bytes); eq(source, original)
  const { preparePdfRaster } = load('pdfRasterPrepare'), { renderPreparedPdfRaster } = load('pdfRasterRenderer')
  const options = { pages: [1, 2, 3], dpi: 72, format: 'png' }, prepared = await preparePdfRaster(source, options)
  const rendered = await renderPreparedPdfRaster(prepared.bytes, options)
  eq(rendered.images.map(i => [i.width, i.height]), [[596, 842], [200, 200], [160, 80]])
  for (const image of rendered.images) { write(`scan-page-${image.page}.png`, image.bytes); const decoded = await canvas.loadImage(image.bytes); ok(decoded.width > 0) }
  const text = await load('pdfTextExtract').extractPdfText(source, ''); eq(text.pages.map(p => p.text), ['', '', ''])
  // Independent Poppler must preserve every source page through reordering.
  execFileSync('pdftoppm', ['-r', '72', '-png', path.join(out, 'scan-source.pdf'), path.join(out, 'poppler-source')])
  execFileSync('pdftoppm', ['-r', '72', '-png', path.join(out, 'scan-sorted.pdf'), path.join(out, 'poppler-sorted')])
  for (const [index, originalPage] of [3, 1, 2].entries()) eq(fs.readFileSync(`${out}/poppler-source-${originalPage}.png`), fs.readFileSync(`${out}/poppler-sorted-${index + 1}.png`))
  async function pixel(bytes, x, y) {
    const image = await canvas.loadImage(bytes), c = canvas.createCanvas(image.width, image.height), ctx = c.getContext('2d')
    ctx.drawImage(image, 0, 0); return Array.from(ctx.getImageData(x, y, 1, 1).data)
  }
  for (const [page, points] of [[1, [[40, 35], [200, 300], [20, 800]]], [2, [[40, 100], [100, 100], [160, 100]]], [3, [[10, 10], [30, 10], [10, 30]]]]) {
    for (const [x, y] of points) {
      const actual = await pixel(fs.readFileSync(`${out}/scan-page-${page}.png`), x, y)
      const reference = await pixel(fs.readFileSync(`${out}/poppler-source-${page}.png`), x, y)
      ok(actual.every((value, channel) => Math.abs(value - reference[channel]) <= 5))
    }
  }
  // Generate a real embedded TrueType subset locally with an installed public font.
  execFileSync('python', ['-c', `from reportlab.pdfgen import canvas\nfrom reportlab.pdfbase import pdfmetrics\nfrom reportlab.pdfbase.ttfonts import TTFont\npdfmetrics.registerFont(TTFont('FixtureDejaVu','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))\nc=canvas.Canvas('${out}/font-source.pdf',pageCompression=0,invariant=1,pagesize=(300,200))\nc.setFont('FixtureDejaVu',20)\nc.drawString(20,150,'Synthetic Café Ω')\nc.save()`])
  const fontSource = new Uint8Array(fs.readFileSync(`${out}/font-source.pdf`))
  const fontDoc = await loadPageDocument(fontSource); auditPdfPreview(fontDoc); checks++
  const fontText = await load('pdfTextExtract').extractPdfText(fontSource, '1'); ok(fontText.pages[0].text.includes('Synthetic Café Ω'))
  const fontCopy = await exportPdfPages(fontSource, [1]); write('font-copy.pdf', fontCopy.bytes)
  const fontPrepared = await preparePdfRaster(fontSource, { ...options, pages: [1] })
  const fontRender = await renderPreparedPdfRaster(fontPrepared.bytes, { ...options, pages: [1] }); write('font-page.png', fontRender.images[0].bytes)
  execFileSync('pdftoppm', ['-r', '72', '-png', `${out}/font-source.pdf`, `${out}/font-before`])
  execFileSync('pdftoppm', ['-r', '72', '-png', `${out}/font-copy.pdf`, `${out}/font-after`])
  eq(fs.readFileSync(`${out}/font-before-1.png`), fs.readFileSync(`${out}/font-after-1.png`))
  // Structurally valid JPEG without Huffman tables: PDF.js resolves its failed
  // image asynchronously as null, even with stopAtErrors. Publication must fail.
  const brokenCanvas = canvas.createCanvas(16, 16), bc = brokenCanvas.getContext('2d')
  bc.fillStyle = 'red'; bc.fillRect(0, 0, 16, 16)
  const validJpeg = new Uint8Array(await brokenCanvas.encode('jpeg', 80)), segments = [validJpeg.subarray(0, 2)]
  let cursor = 2
  while (cursor < validJpeg.length) {
    const marker = validJpeg[cursor + 1]
    if (marker === 0xda) { segments.push(validJpeg.subarray(cursor)); break }
    const length = validJpeg[cursor + 2] * 256 + validJpeg[cursor + 3]
    if (marker !== 0xc4) segments.push(validJpeg.subarray(cursor, cursor + length + 2))
    cursor += length + 2
  }
  const badJpeg = new Uint8Array(Buffer.concat(segments.map(segment => Buffer.from(segment))))
  const brokenDoc = await pdf.PDFDocument.create({ updateMetadata: false }), brokenImage = await brokenDoc.embedJpg(badJpeg)
  brokenDoc.addPage([100, 100]).drawImage(brokenImage, { x: 0, y: 0, width: 100, height: 100 })
  const brokenPdf = new Uint8Array(await brokenDoc.save({ useObjectStreams: false }))
  const brokenPrepared = await preparePdfRaster(brokenPdf, { ...options, pages: [1] })
  await assert.rejects(() => renderPreparedPdfRaster(brokenPrepared.bytes, { ...options, pages: [1] }), /静默省略/); checks++
  const transition = await pdf.PDFDocument.load(fontSource); transition.getPage(0).node.set(pdf.PDFName.of('Trans'), transition.context.obj({ S: 'Dissolve' }))
  await assert.rejects(() => transition.save({ useObjectStreams: false }).then(bytes => loadPageDocument(bytes)), /Trans/); checks++
  console.log(`${checks} actual PDF.js scan/mask/font/text and independent Poppler preservation checks passed. Synthetic fixtures only; browser/Windows untested.`)
} finally { globalThis.fetch = previousFetch }
