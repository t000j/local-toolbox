// Only synthetic PDFs; tests page selection, geometry, resource identity and output order.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),pdf=require('pdf-lib')
const cache=new Map();function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);const code=ts.transpileModule(fs.readFileSync(path.join('src/tools',`${name}.ts`),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,id=>id.startsWith('.')?load(id.replace(/^\.\//,'')):require(id));return exports}
const {parsePageSelection,inspectPdfPages,exportPdfPages}=load('pdfPages'),{pdfPageFingerprinter}=load('pdfPageFingerprint')
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},reject=async(fn,re)=>{await assert.rejects(fn,re);checks++}
async function main(){
 eq(parsePageSelection('1-3, 5, 4',5),[1,2,3,5,4]);eq(parsePageSelection('200',200),[200]);eq(parsePageSelection('1-1',1),[1])
 for(const s of ['',',','0','01','-1','1.5','1e1','1,,2','1,1','1-3,3-4','3-1','1-201','2','1;2','1，2','NaN','  ', '1,'.repeat(1001)]){assert.throws(()=>parsePageSelection(s,1));checks++}
 const source=await pdf.PDFDocument.create({updateMetadata:false})
 for(let i=0;i<4;i++){const p=source.addPage([320+i*20,240+i*10]);p.drawText(`SYNTHETIC PAGE ${i+1}`,{x:25,y:150,size:16});p.setCropBox(10,10,280+i*10,200+i*10);p.setRotation(pdf.degrees(i*90));p.node.set(pdf.PDFName.of('UserUnit'),pdf.PDFNumber.of(1+i/4))}
 const bytes=await source.save({useObjectStreams:false}),frozen=Buffer.from(bytes),infos=await inspectPdfPages(bytes)
 eq(infos.map(p=>p.rotation),[0,90,180,270]);eq(infos.map(p=>p.number),[1,2,3,4]);eq(Buffer.from(bytes),frozen)
 const split=await exportPdfPages(bytes,[4,2]),reopened=await pdf.PDFDocument.load(split.bytes,{updateMetadata:false}),original=await pdf.PDFDocument.load(bytes,{updateMetadata:false})
 eq(split.order,[4,2]);eq(split.sourcePages,4);eq(split.pages.map(p=>p.rotation),[270,90]);eq(reopened.getPageCount(),2)
 const a=pdfPageFingerprinter(original),b=pdfPageFingerprinter(reopened);eq(await a(original.getPage(3)),await b(reopened.getPage(0)));eq(await a(original.getPage(1)),await b(reopened.getPage(1)))
 const inputOrder=[1,3],pending=exportPdfPages(bytes,inputOrder);inputOrder[0]=2;eq((await pending).order,[1,3]);eq(Buffer.from(bytes),frozen)
 for(const order of [[],[0],[-1],[1.5],[5],[1,1],Array.from({length:201},(_,i)=>i+1)])await reject(()=>exportPdfPages(bytes,order))
 for(const turns of [[90],[-90,0],[360,0],[45,0],[NaN,0]])await reject(()=>exportPdfPages(bytes,[1,2],turns))
 await reject(()=>inspectPdfPages(new Uint8Array([1,2,3])));await reject(()=>inspectPdfPages(new Uint8Array(8*1024*1024+1)))
 const ordered=await exportPdfPages(bytes,[3,1,4,2]),orderedDoc=await pdf.PDFDocument.load(ordered.bytes,{updateMetadata:false}),orderedHash=pdfPageFingerprinter(orderedDoc);for(const [i,n] of [3,1,4,2].entries())eq(await orderedHash(orderedDoc.getPage(i)),await a(original.getPage(n-1)));eq(ordered.order,[3,1,4,2]);
 const packed=await source.save({useObjectStreams:true});eq((await exportPdfPages(packed,[3,1,4,2])).order,[3,1,4,2]);
 const out='/tmp/local-toolbox-pdf-pages-check';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/source.pdf',bytes);fs.writeFileSync(out+'/split.pdf',split.bytes);fs.writeFileSync(out+'/ordered.pdf',ordered.bytes)
 console.log(`${checks} synthetic PDF selection/identity/boundary checks passed; renderer/UI/native save not invoked`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
