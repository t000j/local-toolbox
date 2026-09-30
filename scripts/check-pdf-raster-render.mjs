// Actual PDF.js + optional native Node canvas, using only generated synthetic PDF.
// This exercises the renderer with an OffscreenCanvas-compatible shim. It is NOT
// browser/WebView/Windows testing or evidence of actual browser worker isolation.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),ts=require('typescript'),pdf=require('pdf-lib'),native=require('@napi-rs/canvas')
const canvases=[]
Object.assign(globalThis,{DOMMatrix:native.DOMMatrix,ImageData:native.ImageData,Path2D:native.Path2D})
globalThis.OffscreenCanvas=class { constructor(w,h) { const canvas=native.createCanvas(w,h);canvases.push(canvas);canvas.convertToBlob=async({type,quality})=>new Blob([await canvas.encode(type==='image/png'?'png':'jpeg',Math.round((quality??.9)*100))],{type});return canvas } }
const originalFetch=globalThis.fetch
globalThis.fetch=async url=>{const file=String(url);assert.ok(file.startsWith(path.resolve('node_modules/pdfjs-dist/standard_fonts')+path.sep));return new Response(fs.readFileSync(file))}
await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
const api=await import('pdfjs-dist/legacy/build/pdf.mjs'),cache=new Map()
const fonts=Object.fromEntries(fs.readdirSync('node_modules/pdfjs-dist/standard_fonts').filter(n=>/\.(pfb|ttf)$/.test(n)).map(n=>[`/node_modules/pdfjs-dist/standard_fonts/${n}`,path.resolve('node_modules/pdfjs-dist/standard_fonts',n)]))
function load(name) { if(cache.has(name))return cache.get(name);const e={};cache.set(name,e);const code=fs.readFileSync(`src/tools/${name}.ts`,'utf8').replace(/import\.meta\.glob\([^\n]+?\) as Record<string, string>/,JSON.stringify(fonts));new Function('exports','require',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,id=>id.endsWith('pdf.worker.mjs')?{}:id.endsWith('/pdf.mjs')?api:id.startsWith('.')?load(id.slice(2)):require(id));return e }
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++},bad=fn=>{assert.throws(fn);checks++}
try {
  const {renderPreparedPdfRaster,rasterCanvasFactory,RasterFilterFactory}=load('pdfRasterRenderer'),{preparePdfRaster}=load('pdfRasterPrepare'),{validatePdfRasterOutput}=load('pdfRasterLimits')
  const d=await pdf.PDFDocument.create({updateMetadata:false})
  const a=d.addPage([200,300]);a.drawText('SYNTHETIC ALPHA',{x:20,y:200,size:16});a.drawRectangle({x:15,y:40,width:70,height:60,color:pdf.rgb(0.1,0.4,0.8)})
  const b=d.addPage([300,200]);b.setCropBox(20,10,100,80);b.setRotation(pdf.degrees(90));b.node.set(pdf.PDFName.of('UserUnit'),pdf.PDFNumber.of(2));b.drawText('BETA',{x:25,y:25,size:10})
  const bytes=await d.save({useObjectStreams:false}),opts={pages:[2,1],dpi:72,format:'png'},prepared=await preparePdfRaster(bytes,opts)
  const png=validatePdfRasterOutput(await renderPreparedPdfRaster(prepared.bytes,opts),opts)
  eq(png.images.map(i=>[i.page,i.width,i.height]),[[2,160,200],[1,200,300]])
  for(const image of png.images){const decoded=await native.loadImage(image.bytes);eq([decoded.width,decoded.height],[image.width,image.height]);const c=native.createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(decoded,0,0);assert.ok(ctx.getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4!==3&&n<150));checks++}
  const jpegOpts={...opts,format:'jpeg',quality:0.8},jpeg=validatePdfRasterOutput(await renderPreparedPdfRaster(prepared.bytes,jpegOpts),jpegOpts)
  eq(jpeg.images.map(i=>[i.width,i.height]),[[160,200],[200,300]])
  for(const image of jpeg.images){const decoded=await native.loadImage(image.bytes);eq([decoded.width,decoded.height],[image.width,image.height])}
  const out='/tmp/local-toolbox-pdf-raster-render-check';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/synthetic-source.pdf',bytes);for(const image of png.images)fs.writeFileSync(out+`/page-${image.page}.png`,image.bytes);for(const image of jpeg.images)fs.writeFileSync(out+`/page-${image.page}.jpg`,image.bytes)
  const doubled=await renderPreparedPdfRaster(prepared.bytes,{...opts,dpi:144});eq(doubled.images.map(i=>[i.width,i.height]),[[320,400],[400,600]])
  assert.ok(canvases.every(c=>c.width===350&&c.height===150));checks++ // native binding maps zero dimensions to its 350×150 defaults.
  const large=await pdf.PDFDocument.create({updateMetadata:false});large.addPage([5000,100]);const big=await preparePdfRaster(await large.save({useObjectStreams:false}),{...opts,pages:[1]});const before=canvases.length;await assert.rejects(()=>renderPreparedPdfRaster(big.bytes,{...opts,pages:[1]}),/4096/);checks++;eq(canvases.length,before)
  const totals=await pdf.PDFDocument.create({updateMetadata:false});for(let i=0;i<5;i++)totals.addPage([2000,2000]);const all={...opts,pages:[1,2,3,4,5]},over=await preparePdfRaster(await totals.save({useObjectStreams:false}),all);const prior=canvases.length;await assert.rejects(()=>renderPreparedPdfRaster(over.bytes,all),/1600万/);checks++;eq(canvases.length,prior)
  const filters=new RasterFilterFactory();eq(filters.addFilter(null),'none');for(const name of ['addAlphaFilter','addLuminosityFilter','addKnockoutFilter','addHCMFilter'])bad(()=>filters[name]());bad(()=>filters.addFilter([]))
  // Canvas reservations use a tiny synthetic canvas object, avoiding large test allocations.
  globalThis.OffscreenCanvas=class {constructor(){this.width=1;this.height=1}getContext(){return {}}}
  const budget=rasterCanvasFactory(),factory=new budget.CanvasFactory(),live=Array.from({length:4},()=>factory.create(2000,2000));bad(()=>factory.create(1,1));bad(()=>factory.reset(live[0],4097,1));factory.destroy(live[0]);eq(live[0].canvas,null);const small=factory.create(1,1);budget.clear();eq(small.canvas.width,0)
  globalThis.document={};await assert.rejects(()=>renderPreparedPdfRaster(prepared.bytes,opts),/隔离线程/);delete globalThis.document;checks++
  console.log(`${checks} actual PDF.js/native-canvas raster and budget checks passed: PNG/JPEG encode and independent decode, DPI, crop/rotation/UserUnit, output order and rejection before large canvas allocation. Browser worker/WebView/native save remain untested.`)
} finally { globalThis.fetch=originalFetch }
