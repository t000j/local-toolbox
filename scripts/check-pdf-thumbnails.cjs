// Service mocks: real Worker creation/termination, deadline, cancellation and canvas cleanup contracts.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict')
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++}
function setup(pending=false){const e={},ports=[],canvases=[];let options,resolvePage,timer,cleared=0,destroyed=0
 class Port{constructor(){this.terminated=0;ports.push(this)}terminate(){this.terminated++}}
 const canvas=()=>{const c={width:0,height:0,toBlob:fn=>fn(new Blob(['synthetic'],{type:'image/png'})),getContext:()=>({})};canvases.push(c);return c}
 const doc={numPages:1,getPage:async()=>{if(pending)await new Promise(r=>resolvePage=r);return {getViewport:({scale})=>({width:200*scale,height:100*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}}}}
 const api={AnnotationMode:{DISABLE:0},PDFWorker:{create:({port})=>({destroy(){destroyed++},port})},getDocument:o=>{options=o;return {promise:Promise.resolve(doc),destroy:async()=>{destroyed++}}}}
 const code=fs.readFileSync('src/tools/pdfThumbnails.ts','utf8').replace(/import\.meta\.glob\([^\n]+?\) as Record<string, string>/,"{} as Record<string,string>")
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('exports','require','document','setTimeout','clearTimeout',js)(e,id=>id.includes('?worker')?{default:Port}:id.includes('pdfPreviewCanvas')?{thumbnailSize:(w,h)=>({scale:1,width:w,height:h}),previewCanvasFactory:()=>({CanvasFactory:class{},clear:()=>{cleared++}})}:api,{createElement:canvas},(fn,ms)=>{if(ms===20000)timer=fn;else fn();return 1},()=>{})
 return {run:e.renderPdfThumbnails,ports,canvases,get options(){return options},get cleared(){return cleared},get destroyed(){return destroyed},timeout:()=>timer(),finish:()=>resolvePage?.()}
}
async function main(){
 const s=setup(),signal=new AbortController();const blobs=await s.run(new Uint8Array([1]),1,signal.signal);eq(blobs.length,1);eq(s.ports[0].terminated,1);eq(s.canvases[0].width,0);eq(s.cleared,1);eq(s.options.useWorkerFetch,false);eq(s.options.useWasm,false);eq(s.options.enableXfa,false);eq(s.options.disableFontFace,true);eq(s.options.stopAtErrors,true);eq(s.options.maxImageSize,1048576);assert.ok(s.options.worker);checks++
 await assert.rejects(()=>new s.options.BinaryDataFactory().fetch({kind:'cMapUrl',filename:'https://example.invalid/'}));checks++
 const c=setup(true),ac=new AbortController(),p=c.run(new Uint8Array([1]),1,ac.signal);await new Promise(setImmediate);ac.abort();await assert.rejects(()=>p,/取消/);checks++;eq(c.ports[0].terminated,2);eq(c.cleared,1);c.finish();await new Promise(setImmediate);eq(c.canvases.length,0)
 const t=setup(true),q=t.run(new Uint8Array([1]),1,new AbortController().signal);await new Promise(setImmediate);t.timeout();await assert.rejects(()=>q,/20秒/);checks++;eq(t.cleared,1);t.finish()
 for(const count of [0,13,1.5]){await assert.rejects(()=>s.run(new Uint8Array([1]),count,new AbortController().signal));checks++}
 console.log(`${checks} simulated thumbnail service cancellation/bounds/resource checks passed; browser/WebView rendering remains untested`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
