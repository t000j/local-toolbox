// Synthetic, local-only PDFs. No real documents, browser, native save, network or renderer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),pdf=require('pdf-lib')
const cache=new Map();function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);const code=ts.transpileModule(fs.readFileSync(path.join('src/tools',`${name}.ts`),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,id=>id.startsWith('.')?load(id.slice(2)):require(id));return exports}
const {mergePdfs}=load('pdfMerge'),{admitPdf}=load('pdfAdmission'),{preflightPdf}=load('pdfPreflight'),{readClassicRecords}=load('pdfClassicRecords'),{auditPdf}=load('pdfAudit'),{pdfPageFingerprinter}=load('pdfPageFingerprint'),{canonicalPdf}=load('pdfCanonical')
const join=(...parts)=>Buffer.concat(parts.map(part=>typeof part==='string'?Buffer.from(part,'latin1'):part)),latin=bytes=>Buffer.from(bytes).toString('latin1')
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=value=>{assert.ok(value);checks++},bad=(fn,re)=>{assert.throws(fn,re);checks++}
const payload=Buffer.from('% literal endstream endobj xref startxref %%EOF\n0 0 1 rg 10 10 20 20 re f\n')
function build(records,options={}){
 const parts=[Buffer.from('%PDF-1.7\n')],entries=new Map([[0,{offset:0,generation:65535,active:false}]]);let size=parts[0].length
 for(const record of records){entries.set(record.id,{offset:size,generation:record.generation??0,active:true});const bytes=join(`${record.id} ${record.generation??0} obj\n`,record.body,'\nendobj\n');parts.push(bytes);size+=bytes.length}
 if(options.editEntries)options.editEntries(entries,join(...parts))
 const xrefOffset=size,sorted=[...entries].sort(([a],[b])=>a-b);let table='xref\n'
 for(const [id,entry] of sorted)table+=`${id} 1\n${String(entry.offset).padStart(10,'0')} ${String(entry.generation).padStart(5,'0')} ${entry.active?'n':'f'} \n`
 if(options.table)table=options.table(table)
 return join(...parts,table,`trailer\n<< /Size ${options.size??Math.max(...entries.keys())+1} /Root ${options.root??'1 0 R'} ${options.trailer??''} >>\nstartxref\n${options.startxref?options.startxref(xrefOffset):xrefOffset}\n%%EOF`)
}
function fixture(options={}){
 const data=options.data??payload,lengthId=options.lengthId??5,lengthGen=options.lengthGen??0,streamGen=options.streamGen??0
 const ref=options.ref??`${lengthId} ${lengthGen} R`,declared=options.direct?String(data.length):ref,token=options.token??'Length',eol=options.eol??'\n'
 const records=[{id:1,generation:options.rootGen??0,body:'<< /Type /Catalog /Pages 2 0 R >>'},{id:2,body:'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'},{id:3,body:`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 100] /Rotate 90 /Resources << >> /Contents ${options.shared?'[4 '+streamGen+' R 6 0 R]':`4 ${streamGen} R`} >>`}]
 const stream={id:4,generation:streamGen,body:join(`<< /${token} ${declared} /Probe (endstream endobj xref) >>${eol}stream${eol}`,data,`${eol}endstream`)}
 const scalar={id:lengthId,generation:lengthGen,body:options.lengthBody??String(data.length)}
 if(options.backward)records.push(scalar,stream);else records.push(stream,...(options.omitLength?[]:[scalar]))
 if(options.shared)records.push({id:6,body:join(`<< /Length ${declared} >>\nstream\n`,data,'\nendstream')})
 records.push(...(options.extra??[]));return build(records,{...options,root:options.root??`1 ${options.rootGen??0} R`})
}
async function verify(options={}){
 const input=fixture(options),snapshot=Buffer.from(input),result=admitPdf(input),baseline=admitPdf(fixture({...options,direct:true}))
 eq(Buffer.from(input),snapshot);ok(result.bytes!==input);eq(result.normalized,true);ok(result.warnings.some(w=>w.includes('间接 Length')))
 const raw=readClassicRecords(result.bytes);eq(raw.patched,0);preflightPdf(result.bytes,16*1024*1024)
 const streams=raw.records.filter(record=>record.stream);eq(streams.length,options.shared?2:1)
 for(const record of streams)eq(Buffer.from(record.stream),options.data??payload)
 const original=readClassicRecords(baseline.bytes)
 for(const record of raw.records){const expected=original.records.find(value=>value.id===record.id);eq(Buffer.from(record.body),join('\n',expected.body,'\n'))}
 const document=await pdf.PDFDocument.load(result.bytes,{updateMetadata:false,throwOnInvalidObject:true}),before=await pdf.PDFDocument.load(baseline.bytes,{updateMetadata:false,throwOnInvalidObject:true})
 eq(auditPdf(document,result.preflight),1);eq(await pdfPageFingerprinter(document)(document.getPage(0)),await pdfPageFingerprinter(before)(before.getPage(0)))
 const repeated=admitPdf(result.bytes);eq(repeated.normalized,false);eq(Buffer.from(repeated.bytes),Buffer.from(result.bytes));result.bytes[0]=0;eq(Buffer.from(input),snapshot)
 return {input,admitted:repeated.bytes}
}
async function main(){
 const rendered=await verify(),merged=await mergePdfs([{name:'indirect.pdf',bytes:rendered.input},{name:'direct.pdf',bytes:fixture({direct:true})}]);eq(merged.pages,2);ok(merged.warnings.some(warning=>warning.startsWith('indirect.pdf：')&&warning.includes('间接 Length')));ok(!merged.warnings.some(warning=>warning.startsWith('indirect.pdf：')&&warning.includes('对象流')));for(const options of [{rootGen:12},{backward:true},{shared:true},{lengthGen:17,streamGen:4},{data:Buffer.alloc(0)},{token:'Leng#74h',ref:'5 % preserve outside reference\n0 R'},{eol:'\r\n'},{eol:'\r'},{lengthId:999999999},{lengthBody:'+'+String(payload.length).padStart(6,'0')},{lengthBody:String(payload.length)+' % original scalar comment\n'},{data:Buffer.from([0,255,13,10,40,41,101,110,100,111,98,106])}])await verify(options)
 const metadata={extra:[{id:7,body:'<< /Producer (Synthetic only) /Length 5 0 R /Nested << /Length 5 0 R >> >>'}],trailer:'/Info 7 0 R /ID [<0123abcd> (literal\\(identity\\))]'}
 const identity=await verify(metadata),identityDoc=await pdf.PDFDocument.load(identity.admitted,{updateMetadata:false});eq(identityDoc.getProducer(),'Synthetic only');ok(latin(identity.admitted).includes('/ID [<0123abcd> (literal\\(identity\\)) ]'));ok(latin(identity.admitted).includes('/Nested << /Length 5 0 R >>'))
 const out='/tmp/local-toolbox-pdf-indirect-lengths-check';fs.mkdirSync(out,{recursive:true});for(const [name,value] of Object.entries({forward:rendered,identity})){fs.writeFileSync(`${out}/${name}-source.pdf`,value.input);fs.writeFileSync(`${out}/${name}-admitted.pdf`,value.admitted)}
 for(const options of [{lengthBody:'6 0 R',extra:[{id:6,body:String(payload.length)}]},{lengthBody:'5 0 R'},{lengthBody:'6 0 R',extra:[{id:6,body:'5 0 R'}]},{lengthBody:'-1'},{lengthBody:'1.5'},{lengthBody:payload.length+'.0'},{lengthBody:'999999999'},{lengthBody:'true'},{lengthBody:'(1)'},{lengthBody:'[1]'},{lengthBody:'<< /A 1 >>'},{lengthBody:'1 2'},{lengthBody:'1\nstream\nx\nendstream'},{ref:'5 1 R'},{ref:'9 0 R'},{omitLength:true},{lengthGen:65536},{lengthBody:'1',data:Buffer.from('ab')},{lengthBody:'1',data:Buffer.from('a ')},{lengthBody:'1',data:Buffer.from('a%comment\n')},{lengthBody:'100',data:Buffer.from('a')},{trailer:'/Prev 1'},{trailer:'/XRefStm 1'},{trailer:'/Encrypt 1 0 R'},{trailer:'/Custom (not silently lost)'},{trailer:'/Info (not an indirect object)'},{trailer:'/ID [<00>]'},{extra:[{id:6,body:'<< /Type /ObjStm >>'}]},{extra:[{id:6,body:'<< /Type /XRef >>'}]},{extra:[{id:6,body:'['.repeat(33)+'0'+']'.repeat(33)}]}])bad(()=>admitPdf(fixture(options)))
 for(const editEntries of [entries=>entries.get(5).active=false,entries=>entries.delete(5),entries=>entries.get(5).generation=1,entries=>entries.get(5).offset++,entries=>entries.get(5).offset=entries.get(4).offset,entries=>entries.get(5).offset=999999,entries=>entries.get(1).active=false,entries=>entries.set(9,{offset:9,generation:0,active:true})])bad(()=>admitPdf(fixture({editEntries})))
 for(const options of [{size:99},{root:'9 0 R'},{startxref:value=>value+1},{table:value=>value.replace('5 1\n','4 1\n')},{table:value=>value.replace('00000 n','65536 n')}])bad(()=>admitPdf(fixture(options)))
 bad(()=>admitPdf(fixture({ref:'5 1 R',editEntries:entries=>entries.get(5).generation=1})));bad(()=>admitPdf(build([{id:1,body:'<< /Type /Catalog >>'},{id:1,generation:1,body:'0'}])));bad(()=>preflightPdf(fixture()),/直接 Length/)
 // A valid-looking length object inside payload is a candidate only, never a proven object boundary.
 let embedded='5 0 obj\n00000\nendobj\nendstream endobj xref startxref %%EOF\n';embedded=embedded.replace('00000',String(embedded.length).padStart(5,'0'))
 bad(()=>admitPdf(fixture({data:Buffer.from(embedded),omitLength:true,editEntries:(entries,bytes)=>entries.set(5,{offset:bytes.indexOf(Buffer.from('5 0 obj')),generation:0,active:true})})),/交叉引用/)
 // A final xref table physically inside an unterminated stream must not be accepted.
 bad(()=>admitPdf(build([{id:1,body:'<< /Type /Catalog >>'},{id:2,body:'999'},{id:3,body:'<< /Length 2 0 R >>\nstream\npayload'}])),/流|Length/)
 const streamXref=join('%PDF-1.7\n1 0 obj\n5\nendobj\n2 0 obj\n<< /Type /XRef /Length 1 0 R >>\nstream\n12345\nendstream\nendobj\nstartxref\n',String('%PDF-1.7\n1 0 obj\n5\nendobj\n'.length),'\n%%EOF');bad(()=>admitPdf(streamXref),/直接流长度/);bad(()=>admitPdf(Buffer.from(latin(streamXref).replace('/Type /XRef','/Type /ObjStm'))),/直接流长度/)
 const source=fixture();for(let i=0;i<source.length;i++)bad(()=>admitPdf(source.subarray(0,i)))
 for(const suffix of ['junk','\n1 0 obj\n0\nendobj\n','\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R /Prev 9 >>\nstartxref\n9\n%%EOF'])bad(()=>admitPdf(join(source,suffix)))
 // Resolution cache includes preparsing in one aggregate node budget, counting each scalar once.
 const one=readClassicRecords(fixture(),true),shared=readClassicRecords(fixture({shared:true}),true);eq(shared.nodes-one.nodes,4)
 const empty=fixture({extra:[{id:10,body:'[]'}]}),remaining=100000-readClassicRecords(empty,true).nodes
 ok(admitPdf(fixture({extra:[{id:10,body:'['+'0 '.repeat(remaining)+']'}]})).normalized)
 bad(()=>admitPdf(fixture({extra:[{id:10,body:'['+'0 '.repeat(remaining+1)+']'}]})),/节点/)
 const many=Array.from({length:5995},(_,i)=>({id:i+6,body:'0'}));eq(admitPdf(fixture({extra:many})).preflight.objects.size,6000);bad(()=>admitPdf(fixture({extra:[...many,{id:6001,body:'0'}]})),/对象数量/)
 bad(()=>admitPdf(Buffer.alloc(8*1024*1024+1)),/上限/);bad(()=>admitPdf(source,16*1024*1024+1),/上限/);bad(()=>canonicalPdf([{id:1,generation:0,offset:0,body:Buffer.alloc(16*1024*1024),value:{kind:'number',number:0}}],{kind:'dict',dict:new Map()}),/16 MiB/)
 const large=fixture({data:Buffer.alloc(8*1024*1024,32)});bad(()=>admitPdf(large),/上限/);const internal=admitPdf(large,16*1024*1024);ok(internal.normalized);const internalAgain=admitPdf(internal.bytes,16*1024*1024);eq(internalAgain.normalized,false);eq(Buffer.from(internalAgain.bytes),Buffer.from(internal.bytes));
 const originalLoad=pdf.PDFDocument.load;let calls=0;pdf.PDFDocument.load=()=>{calls++;throw new Error('Admission must not load a PDF')};admitPdf(source);bad(()=>admitPdf(fixture({lengthBody:'5 0 R'})));eq(calls,0);pdf.PDFDocument.load=originalLoad
 let random=0x01234567;for(let i=0;i<300;i++){const mutation=Buffer.from(source);random=(Math.imul(random,1664525)+1013904223)>>>0;mutation[random%mutation.length]^=(random>>>24)||1;try{const result=admitPdf(mutation);preflightPdf(result.bytes,16*1024*1024);ok(result.preflight.objects.size<=6000)}catch(error){ok(error instanceof Error&&!(error instanceof RangeError)&&!(error instanceof TypeError))}}
 console.log(`${checks} indirect Length boundary, preservation, budget and fingerprint assertions passed; fixtures: ${out}/`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
