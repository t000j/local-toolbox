// Paired synthetic lexical fixtures. No unsafe range is given to PDF.js.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),pdf=require('pdf-lib')
const cache=new Map();function load(n){if(cache.has(n))return cache.get(n);const e={};cache.set(n,e);new Function('exports','require',ts.transpileModule(fs.readFileSync(`src/tools/${n}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,id=>id.startsWith('.')?load(id.slice(2)):require(id));return e}
let checks=0;const ok=fn=>{fn();checks++},bad=(fn,re)=>{assert.throws(fn,re);checks++};const bytes=s=>new TextEncoder().encode(s),gate=s=>load('pdfContentSyntax').rejectPdfInlineImages(bytes(s))
for(const text of ['BT (BILL BINARY BIRD BI) Tj ET','BT (escaped \\( BI \\) and (nested BI)) Tj ET','% BI /W 1 /H 1\nBT (OK) Tj ET','/BI 12 Tf','<4249> Tj','BT (line\\\r\nBI) Tj ET','<< /Label (BI) >>']) ok(()=>gate(text))
for(const text of ['BI /W 1 /H 1 ID x EI','q\nBI\n/W 1 ID x EI','(safe)BI /W 1','% safe\nBI\tID','<< /X 1 >> BI','[ /BI ] BI','<4249>BI','qBI /W 1 /H 1 /BPC 8 /CS /G ID x EI Q','0BI /W 1 ID x EI','BILL BINARY BIRD','q0BI','QBI']) bad(()=>gate(text),/BI/)
for(const text of ['(unfinished','(escaped\\','<42']) bad(()=>gate(text),/未结束|截断/)
async function main(){
 const d=await pdf.PDFDocument.create({updateMetadata:false}),page=d.addPage([100,100]);d.setTitle('Notes about /Prev /Encrypt /ObjStm /XRef entries')
 page.node.set(pdf.PDFName.of('Contents'),d.context.register(d.context.stream(bytes('BT (BILL BINARY BIRD BI /Prev) Tj ET\n% BI /Prev /Encrypt\n'))))
 const encoded=await d.save({useObjectStreams:false});const admission=load('pdfAdmission').admitPdf(encoded),read=await pdf.PDFDocument.load(admission.bytes,{updateMetadata:false})
 ok(()=>load('pdfPreviewGate').auditPdfPreview(read));assert.equal(read.getTitle(),d.getTitle());checks++
 for(const name of ['Prev','Encrypt','XRefStm','ObjStm','XRef','Pr#65v']) {
   const reader=new(load('pdfRawSyntax').PdfRawReader)(bytes(`<< /${name} 1 >>`),true,undefined,false);bad(()=>reader.object(),/不支持/)
 }
 const malicious=await pdf.PDFDocument.load(encoded,{updateMetadata:false});malicious.getPage(0).node.set(pdf.PDFName.of('Contents'),malicious.context.register(malicious.context.stream(bytes('BI /W 1 /H 1 ID x EI'))));bad(()=>load('pdfPreviewGate').auditPdfPreview(malicious),/BI/)
 console.log(`${checks} paired PDF lexical audit assertions passed; original structural/resource guards retained`)
}main().catch(error=>{console.error(error);process.exitCode=1})
