// Synthetic documents only. No browser, network, user files, or renderer is invoked by mergePdfs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),pdf=require('pdf-lib')
const cache=new Map()
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);const code=ts.transpileModule(fs.readFileSync(path.join('src/tools',`${name}.ts`),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,id=>id.startsWith('.')?load(id.replace(/^\.\//,'')):require(id));return exports}
const {mergePdfs,PDF_MERGE_LIMITATIONS}=load('pdfMerge'),{preflightPdf}=load('pdfPreflight'),{rejectStreamNames}=load('pdfRawSyntax')
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=value=>{assert.ok(value);checks++},throws=(fn,re)=>{assert.throws(fn,re);checks++},reject=async(fn,re)=>{await assert.rejects(fn,re);checks++}
const item=(bytes,name='synthetic.pdf')=>({name,bytes}),save=doc=>doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false})
async function fixture(label,options={}){const doc=await pdf.PDFDocument.create({updateMetadata:false});for(let i=0;i<(options.pages??1);i++){const page=doc.addPage([options.width??320,options.height??240]);page.drawText(`${label} PAGE ${i+1}`,{x:30,y:160,size:18});page.setCropBox(10,10,280,210);page.setRotation(pdf.degrees(options.rotation??0));if(options.mutate)options.mutate(doc,page,i)}return save(doc)}
// Build exact classic xref tables for malformed structural cases (no parser recovery required).
function rawPdf(objects,trailer=''){let text='%PDF-1.7\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text,'latin1'));text+=`${i+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(text,'latin1');text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(const offset of offsets.slice(1))text+=`${String(offset).padStart(10,'0')} 00000 n \n`;text+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(text,'latin1')}
const minimal=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>']
async function main(){
 const first=await fixture('ALPHA',{pages:2}),second=await fixture('BRAVO',{rotation:90,width:420,height:300}),copies=[Buffer.from(first),Buffer.from(second)]
 const result=await mergePdfs([item(first,'a.pdf'),item(second,'b.pdf')]);eq(result.pages,3);eq(result.inputs,[{name:'a.pdf',pages:2},{name:'b.pdf',pages:1}]);eq(Buffer.from(first),copies[0]);eq(Buffer.from(second),copies[1]);ok(result.bytes.length>0);eq(result.warnings,PDF_MERGE_LIMITATIONS)
 const reopened=await pdf.PDFDocument.load(result.bytes,{updateMetadata:false});eq(reopened.getPageCount(),3);eq(reopened.getPages().map(p=>p.getRotation().angle),[0,0,90]);eq(reopened.getPages().map(p=>p.getMediaBox().width),[320,320,420]);eq(reopened.getPage(2).getCropBox(),{x:10,y:10,width:280,height:210});ok(!Buffer.from(result.bytes).includes(Buffer.from('/ObjStm')));ok(!Buffer.from(result.bytes).includes(Buffer.from('/XRef')))
 fs.mkdirSync('/tmp/local-toolbox-pdf-merge-check',{recursive:true});fs.writeFileSync('/tmp/local-toolbox-pdf-merge-check/merged-synthetic.pdf',result.bytes);fs.writeFileSync('/tmp/local-toolbox-pdf-merge-check/source-alpha.pdf',first);fs.writeFileSync('/tmp/local-toolbox-pdf-merge-check/source-bravo.pdf',second)
 const frozen=Buffer.from(first), pending=mergePdfs([item(frozen),item(second)]);frozen.fill(0);eq((await pending).pages,3)
 const blank=rawPdf(minimal);eq((await mergePdfs([item(blank),item(blank)])).pages,2)
 for(const inputs of [[],[item(first)],Array.from({length:9},()=>item(first)),[null,item(first)],[item(first,''),item(second)],[item(Buffer.alloc(8*1024*1024+1)),item(second)],[item(Buffer.alloc(8*1024*1024)),item(Buffer.alloc(8*1024*1024)),item(second)]])await reject(()=>mergePdfs(inputs))
 for(const bytes of [Buffer.from('not PDF'),Buffer.from('%PDF-2.0\n%%EOF'),Buffer.concat([blank,Buffer.from('extra')]),blank.subarray(0,-1)])await reject(()=>mergePdfs([item(bytes),item(second)]))
 for(const name of ['ObjStm','XRef','Encrypt','XRefStm','Prev'])for(const encoded of [name,[...name].map(c=>'#'+c.charCodeAt(0).toString(16).toUpperCase()).join(''),[...name].map(c=>'#'+c.charCodeAt(0).toString(16)).join('')])throws(()=>rejectStreamNames(Buffer.from(`% comment\n /${encoded}\n`)))
 const originalLoad=pdf.PDFDocument.load;let calls=0;pdf.PDFDocument.load=async(...args)=>{calls++;return originalLoad.apply(pdf.PDFDocument,args)}
 await reject(()=>mergePdfs([item(rawPdf([...minimal,'<< /Type /#4FbjStm /Length 3 /Filter /FlateDecode >>\nstream\nxxx\nendstream'])),item(second)]),/ObjStm/);eq(calls,0);pdf.PDFDocument.load=originalLoad
 const compressed=await pdf.PDFDocument.create({updateMetadata:false});compressed.addPage();const objectStream=await compressed.save();eq((await mergePdfs([item(objectStream),item(second)])).pages,2)
 for(const source of [rawPdf([...minimal,'['.repeat(34)+'0'+']'.repeat(34)]),rawPdf([...minimal,'<< /A 1 /A 2 >>']),rawPdf([...minimal,'<< /Length 99 >>\nstream\nx\nendstream']),rawPdf([...minimal,'<< /Length 5 0 R >>\nstream\nx\nendstream','6 0 R','1']),rawPdf([...minimal,'99999 0 R']),rawPdf([...minimal,'('+ '('.repeat(33)+'x'+')'.repeat(33)+')']),rawPdf([...minimal,'('+ 'a'.repeat(65537)+')'])])await reject(()=>mergePdfs([item(source),item(second)]))
 const brokenOffset=Buffer.from(blank);const xref=brokenOffset.indexOf(Buffer.from('0000000009'));ok(xref>=0);brokenOffset[xref+9]=56;await reject(()=>mergePdfs([item(brokenOffset),item(second)]),/偏移/)
 for(const key of ['AcroForm','OpenAction','AA','Names','Outlines','OutputIntents','OCProperties','StructTreeRoot','MarkInfo','Perms','Collection']){const source=await fixture('REJECT',{mutate:doc=>doc.catalog.set(pdf.PDFName.of(key),doc.context.obj({}))});await reject(()=>mergePdfs([item(source),item(second)]))}
 for(const name of ['JavaScript','Sig','Filespec','EmbeddedFile','OCG','StructElem','Crypt','PS','PostScript']){const source=rawPdf([...minimal,`<< /Type /${name} >>`]);await reject(()=>mergePdfs([item(source),item(second)]))}
 for(const mutate of [
  (doc,page)=>page.node.set(pdf.PDFName.of('Annots'),doc.context.obj([{Subtype:'Link',A:{S:'URI',URI:pdf.PDFString.of('https://example.invalid')}}])),
  (doc,page)=>page.node.set(pdf.PDFName.of('AA'),doc.context.obj({})),
  (doc,page)=>page.node.set(pdf.PDFName.of('UserUnit'),pdf.PDFNumber.of(-1)),
  (doc,page)=>page.node.set(pdf.PDFName.of('Parent'),page.ref),
  (doc,page)=>page.node.set(pdf.PDFName.of('Contents'),doc.context.register(doc.context.stream('x',{F:pdf.PDFString.of('external.dat')}))),
  (doc,page)=>{const circular=doc.context.obj({});const ref=doc.context.register(circular);circular.set(pdf.PDFName.of('Self'),ref);page.node.set(pdf.PDFName.of('Resources'),circular)},
 ]){const source=await fixture('REJECT',{mutate});await reject(()=>mergePdfs([item(source),item(second)]))}
 for(const changed of [minimal.map((v,i)=>i===1?v.replace('/Count 1','/Count 2'):v),minimal.map((v,i)=>i===1?v.replace('[3 0 R]','[2 0 R]'):v),minimal.map((v,i)=>i===1?v.replace('[3 0 R]','[3 0 R 3 0 R]').replace('/Count 1','/Count 2'):v),minimal.map((v,i)=>i===0?v.replace('/Catalog','/Pages'):v)])await reject(()=>mergePdfs([item(rawPdf(changed)),item(second)]))
 const validUnit=await fixture('UNIT',{mutate:(doc,page)=>page.node.set(pdf.PDFName.of('UserUnit'),pdf.PDFNumber.of(2))});eq((await mergePdfs([item(validUnit),item(second)])).pages,2)
 for(const unit of [0,-0.1,75001]){const source=await fixture('BAD UNIT',{mutate:(doc,page)=>page.node.set(pdf.PDFName.of('UserUnit'),pdf.PDFNumber.of(unit))});await reject(()=>mergePdfs([item(source),item(second)]),/UserUnit/)}
 const hundred=await pdf.PDFDocument.create({updateMetadata:false});for(let i=0;i<100;i++)hundred.addPage();const hundredBytes=await save(hundred);eq((await mergePdfs([item(hundredBytes),item(hundredBytes)])).pages,200)
 const maxPages=await pdf.PDFDocument.create({updateMetadata:false});for(let i=0;i<200;i++)maxPages.addPage();const maxBytes=await save(maxPages);await reject(()=>mergePdfs([item(maxBytes),item(second)]),/200/)
 for(let i=0;i<blank.length;i++)throws(()=>preflightPdf(blank.subarray(0,i)))
 throws(()=>preflightPdf(rawPdf([...minimal,...Array(5998).fill('0')])),/对象数量/)
 const bigDeclared=rawPdf([...minimal,'<< /Type 5 0 R /Length 1 >>\nstream\nx\nendstream','/ObjStm']);throws(()=>preflightPdf(bigDeclared),/ObjStm/)
 // Inherited page resources, boxes and rotation survive being copied out of the source page tree.
 const inherited=rawPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 200 120] /CropBox [2 3 150 100] /Rotate 270 /Resources << >> >>','<< /Type /Page /Parent 2 0 R >>']);const inheritedResult=await mergePdfs([item(inherited),item(blank)]);const inheritedDoc=await pdf.PDFDocument.load(inheritedResult.bytes,{updateMetadata:false});eq(inheritedDoc.getPage(0).getRotation().angle,270);eq(inheritedDoc.getPage(0).getCropBox(),{x:2,y:3,width:148,height:97})
 console.log(`${checks} synthetic PDF merge assertions passed; fixture: /tmp/local-toolbox-pdf-merge-check/merged-synthetic.pdf`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
