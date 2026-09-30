// Synthetic admission, dimensions and UI/worker boundary tests. No browser/private files.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript'), pdf = require('pdf-lib'), zlib = require('node:zlib')
const cache = new Map()
function load(name) { if (cache.has(name)) return cache.get(name); const e = {}; cache.set(name,e); new Function('exports','require',ts.transpileModule(fs.readFileSync(`src/tools/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,id=>id.startsWith('.')?load(id.slice(2)):require(id)); return e }
const limits = load('pdfRasterLimits'), { preparePdfRaster } = load('pdfRasterPrepare')
let checks = 0
function eq(a,b) { assert.deepEqual(a,b); checks++ }
function bad(fn,re) { assert.throws(fn,re); checks++ }
async function rejects(fn,re) { await assert.rejects(fn,re); checks++ }
function png(width=1,height=1) {
  function chunk(type,data) { const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);let crc=0xffffffff;for(const b of out.subarray(4,-4)){crc^=b;for(let j=0;j<8;j++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out }
  const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=2
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,255,255]))),chunk('IEND',Buffer.alloc(0))]))
}
const options = { pages:[1], dpi:72, format:'png' }
function output() { const bytes=png();return { images:[{page:1,width:1,height:1,bytes}],dpi:72,format:'png',mime:'image/png',totalPixels:1,totalBytes:bytes.length,sourcePages:1 } }
function service() {
  const e={},workers=[];let timer
  class Worker { constructor(){this.terminated=0;workers.push(this)}postMessage(value){this.request=value}terminate(){this.terminated++} }
  const code=fs.readFileSync('src/tools/pdfRaster.ts','utf8').replace("new URL('./pdfRaster.worker.ts', import.meta.url)", "'synthetic-worker'")
  new Function('exports','require','Worker','setTimeout','clearTimeout',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,()=>limits,Worker,fn=>{timer=fn;return 1},()=>{})
  return { run:e.renderPdfRaster,workers,timeout:()=>timer() }
}
async function main() {
  for(const pages of [[],[0],[201],[1,1],[1.5],Array.from({length:9},(_,i)=>i+1)])bad(()=>limits.validatePdfRasterOptions({...options,pages}))
  for(const dpi of [0,35,301,NaN,Infinity,72.5])bad(()=>limits.validatePdfRasterOptions({...options,dpi}))
  for(const quality of [0,1.1,NaN,Infinity])bad(()=>limits.validatePdfRasterOptions({...options,quality}))
  bad(()=>limits.validatePdfRasterOptions({...options,format:'webp'}));eq(limits.validatePdfRasterOptions({...options,dpi:36}).dpi,36);eq(limits.validatePdfRasterOptions({...options,dpi:300}).dpi,300)
  const control={...options,pages:[2,1]},copy=limits.validatePdfRasterOptions(control);control.pages.reverse();eq(copy.pages,[2,1])
  eq(limits.pdfRasterSize(2000,2000),{width:2000,height:2000,pixels:4000000});eq(limits.pdfRasterSize(4096,1).width,4096)
  for(const n of [0,-1,NaN,Infinity,4097])bad(()=>limits.pdfRasterSize(n,1));bad(()=>limits.pdfRasterSize(2000.1,2000))
  eq(limits.validatePdfRasterOutput(output(),options).images.length,1)
  for(const patch of [{dpi:96},{format:'jpeg'},{mime:'image/jpeg'},{totalPixels:2},{totalBytes:2},{sourcePages:0},{sourcePages:201}])bad(()=>limits.validatePdfRasterOutput({...output(),...patch},options))
  const tampered=output();tampered.images[0].width=2;bad(()=>limits.validatePdfRasterOutput(tampered,options),/尺寸/)
  const wrong=output();wrong.images[0].bytes[0]=0;bad(()=>limits.validatePdfRasterOutput(wrong,options),/格式/)
  const d=await pdf.PDFDocument.create({updateMetadata:false});for(let i=0;i<3;i++)d.addPage([100+i,120+i]).drawText(`SYNTHETIC ${i}`)
  const bytes=await d.save({useObjectStreams:false}),prepared=await preparePdfRaster(bytes,{...options,pages:[3,1]});eq(prepared.sourcePages,3);const selected=await pdf.PDFDocument.load(prepared.bytes);eq(selected.getPages().map(p=>p.getWidth()),[102,100]);await rejects(()=>preparePdfRaster(bytes,{...options,pages:[4]}),/超出/)
  // No unsafe rendering: prove an untyped mask is rejected before PDF.js sees it.
  const mask=d.context.register(d.context.stream(new Uint8Array([0]),{Width:1000000,Height:1000000,BitsPerComponent:1,ColorSpace:'DeviceGray'}))
  const image=d.context.register(d.context.stream(new Uint8Array([0]),{Subtype:'Image',Width:1,Height:1,BitsPerComponent:8,ColorSpace:'DeviceGray',SMask:mask}))
  d.getPage(0).node.set(pdf.PDFName.of('Resources'),d.context.obj({XObject:{Im1:image}}));const masked=await d.save({useObjectStreams:false});await rejects(()=>preparePdfRaster(masked,options),/SMask/)
  const f=new File(['synthetic'],'synthetic.pdf'),s=service(),ac=new AbortController(),promise=s.run(f,options,ac.signal);eq(s.workers.length,1);s.workers[0].onmessage({data:{ok:true,result:output()}});eq((await promise).totalPixels,1);eq(s.workers[0].terminated,1);s.timeout();eq(s.workers[0].terminated,1)
  const c=service(),cancel=new AbortController(),pending=c.run(f,options,cancel.signal);cancel.abort();await rejects(()=>pending,/取消/);eq(c.workers[0].terminated,1);c.workers[0].onmessage({data:{ok:true,result:output()}});eq(c.workers[0].terminated,1)
  const t=service(),timed=t.run(f,options,new AbortController().signal);t.timeout();await rejects(()=>timed,/30秒/);eq(t.workers[0].terminated,1)
  const stopped=service(),already=new AbortController();already.abort();await rejects(()=>stopped.run(f,options,already.signal),/取消/);eq(stopped.workers.length,0)
  const malformed=service(),badResult=malformed.run(f,options,new AbortController().signal);malformed.workers[0].onmessage({data:{ok:true,result:{}}});await rejects(()=>badResult,/不一致/);eq(malformed.workers[0].terminated,1)
  const error=service(),failed=error.run(f,options,new AbortController().signal);error.workers[0].onerror({preventDefault(){}});await rejects(()=>failed,/OffscreenCanvas/);eq(error.workers[0].terminated,1)
  console.log(`${checks} synthetic PDF raster admission/options/output/cancellation checks passed. Worker scheduling and DOM capability behavior are mocks, not browser/WebView evidence.`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
