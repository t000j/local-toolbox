// Pure synthetic ZIP fixtures and source guardrails. No user files/native IO.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript'), fflate = require('fflate')
const compiled = ts.transpileModule(fs.readFileSync('src/tools/zipArchive.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const zip = {}; new Function('exports', 'require', compiled)(zip, require)
let checks = 0
const eq = (a,b) => { assert.deepEqual(a,b); checks++ }, bad = fn => { assert.throws(fn); checks++ }, rejects = async fn => { await assert.rejects(fn); checks++ }
const text = s => new TextEncoder().encode(s), file = (name, data = '', directory = false) => ({ name, file: new Blob([data]), directory })
const raw = entries => fflate.zipSync(entries, { level: 0 })
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
function central(bytes, index = 0) { let p = view(bytes).getUint32(bytes.length - 6, true); for(let i=0;i<index;i++) p += 46 + view(bytes).getUint16(p+28,true) + view(bytes).getUint16(p+30,true) + view(bytes).getUint16(p+32,true); return p }
async function test() {
  for (const name of ['hello.txt','根目录/空目录/','é/中文😀.bin','.hidden','a'.repeat(120)]) eq(zip.validZipName(name), true)
  for (const name of ['', '/abs', '../a', 'a/../b', 'a//b','a\\b','C:/a','a:x','NUL','CON.txt','CONIN$','conout$.x','COM0','COM¹.txt','LPT9','NUL .txt','a.','a ','a\u0085','a\ud800','a'.repeat(121),Array(17).fill('a').join('/')]) eq(zip.validZipName(name), false)
  const created = await zip.runZip({ mode:'create', files:[file('bundle/', '', true),file('bundle/empty/', '', true),file('bundle/nested/data.bin',new Uint8Array([0,1,255,64])),file('bundle/zero.txt'),file('bundle/中文😀.txt','héllo 🌍')] })
  eq(created.entries.length,6); eq(created.entries.filter(e=>e.directory).map(e=>e.name).sort(),['bundle/','bundle/empty/','bundle/nested/'])
  const restored = await zip.runZip({ mode:'extractAll',file:new Blob([created.bytes]) })
  eq(restored.tree.length,6); eq(restored.tree.filter(e=>e.directory).every(e=>e.content===''&&e.size===0&&e.crc===0),true)
  eq(Buffer.from(restored.tree.find(e=>e.name==='bundle/nested/data.bin').content,'base64'),Buffer.from([0,1,255,64]))
  eq(Buffer.from(restored.tree.find(e=>e.name==='bundle/中文😀.txt').content,'base64').toString(),'héllo 🌍')
  const again = await zip.runZip({mode:'create', files: zip.directoryZipInputs(JSON.stringify(restored.tree))})
  eq(again.entries.map(e=>[e.name,e.size,e.directory]),created.entries.map(e=>[e.name,e.size,e.directory]))
  const implicit = await zip.runZip({mode:'extractAll',file:new Blob([raw({'a/b/c.txt':text('ok')})])})
  eq(implicit.tree.map(e=>e.name),['a/','a/b/','a/b/c.txt'])
  const empty = await zip.runZip({mode:'extractAll',file:new Blob([raw({})])}); eq(empty.tree,[])
  const emptyRoot = await zip.runZip({mode:'create',files:[file('empty/','',true)]}); eq(emptyRoot.entries[0].directory,true)
  const high = await zip.runZip({mode:'create',files:[file('high.bin',new Uint8Array(1024*1024))]}); eq(high.entries[0].method,0)
  const many = await zip.runZip({mode:'create',files:Array.from({length:200},(_,i)=>file(`d${i}/`,'',true))}); eq(many.entries.length,200)
  for(const inputs of [[file('../bad')],[file('folder/')],[file('folder','',true)],[file('f/','data',true)],[file('A/x'),file('a/y')],[file('é/x'),file('e\u0301/y')],[file('a'),file('a/b')],[file('a/','',true),file('a/','',true)],[file('a'),file('a')],Array.from({length:200},(_,i)=>file(`d${i}/f`)),[file('large',new Uint8Array(zip.MAX_ZIP_OUTPUT+1))]]) await rejects(()=>zip.runZip({mode:'create',files:inputs}))
  for(const name of ['../a','/a','a\\b','NUL.txt','a:x']) bad(()=>zip.inspectZip(raw({[name]:text('x')})))
  for(const names of [['A/x','a/y'],['a','a/b'],['é','e\u0301']]) bad(()=>zip.inspectZip(raw(Object.fromEntries(names.map(n=>[n,text('x')])))))
  const tooManyParents = raw(Object.fromEntries(Array.from({length:101},(_,i)=>[`d${i}/f`,text('x')]))); eq(zip.inspectZip(tooManyParents).length,101); await rejects(()=>zip.runZip({mode:'extractAll',file:new Blob([tooManyParents])}))
  const damaged=created.bytes.slice(), entry=zip.inspectZip(damaged).find(e=>!e.directory&&e.size); damaged[entry.start]^=0xff; await rejects(()=>zip.runZip({mode:'extractAll',file:new Blob([damaged])}))
  for(const mutate of [b=>view(b).setUint16(central(b)+8,1,true),b=>view(b).setUint32(central(b)+38,0xa0000000,true),b=>view(b).setUint32(central(b)+24,zip.MAX_ZIP_OUTPUT+1,true),b=>view(b).setUint16(b.length-18,1,true)]) {const b=raw({'f':text('data')});mutate(b);bad(()=>zip.inspectZip(b))}
  const badDirectory=raw({'dir/':new Uint8Array()}); view(badDirectory).setUint32(central(badDirectory)+16,1,true); bad(()=>zip.inspectZip(badDirectory))
  const inflation=fflate.zipSync({'bomb':new Uint8Array(40000)},{level:6}); const cp=central(inflation), lp=view(inflation).getUint32(cp+42,true); view(inflation).setUint32(cp+24,1,true); view(inflation).setUint32(lp+22,1,true); eq(zip.inspectZip(inflation)[0].size,1); await rejects(()=>zip.runZip({mode:'extractAll',file:new Blob([inflation])}))
  // Well-framed ZIP containers whose raw Deflate payload is truncated or has
  // hidden suffix bytes must fail even when expanded length and CRC still match.
  function packedZip(data,packed) {
    const base=fflate.zipSync({'stream.bin':data},{level:6}), entry=zip.inspectZip(base)[0], oldCentral=central(base), delta=packed.length-entry.packed
    const bytes=Buffer.concat([Buffer.from(base.subarray(0,entry.start)),Buffer.from(packed),Buffer.from(base.subarray(entry.start+entry.packed))]), dv=view(bytes)
    dv.setUint32(18,packed.length,true);dv.setUint32(oldCentral+delta+20,packed.length,true);dv.setUint32(bytes.length-6,oldCentral+delta,true);return bytes
  }
  const payload=text('strict Deflate framing fixture'), packed=fflate.deflateSync(payload,{level:6})
  for(const suffix of [new Uint8Array([0]),new Uint8Array([255]),packed,new Uint8Array(65536)]) {const b=packedZip(payload,Buffer.concat([packed,suffix]));eq(zip.inspectZip(b).length,1);await rejects(()=>zip.runZip({mode:'extractAll',file:new Blob([b])}))}
  for(let n=0;n<packed.length;n++) {const b=packedZip(payload,packed.subarray(0,n));await rejects(()=>zip.runZip({mode:'extractAll',file:new Blob([b])}))}
  for(const size of [0,1,16383,16384,16385,65536,160000]) for(const level of [0,1,6,9]) {
    const input=Uint8Array.from({length:size},(_,i)=>(i*17+(i>>>8))%251), compressed=fflate.deflateSync(input,{level}), entry={name:'f',size,packed:compressed.length,start:0,crc:zip.crc32(input),method:8,directory:false}
    eq(Buffer.from(zip.extractZip(compressed,entry)),Buffer.from(input))
  }
  const ratio=fflate.zipSync({'bomb':new Uint8Array(100000)},{level:6}); bad(()=>zip.inspectZip(ratio))
  await rejects(()=>zip.runZip({mode:'extract',file:new Blob([created.bytes]),index:0})); await rejects(()=>zip.runZip({mode:'extract',file:new Blob([created.bytes]),index:999}))
  for(const value of ['not json','{}','[]',JSON.stringify([{name:'a',directory:false,content:'eA==',size:2}]),JSON.stringify([{name:'a/',directory:true,content:'eA==',size:1}]),JSON.stringify([{name:'a',directory:false,content:'!',size:1}]),JSON.stringify([{name:'../a',directory:false,content:'',size:0}])]) bad(()=>zip.directoryZipInputs(value))
  eq(zip.directoryZipInputs(JSON.stringify([{name:'empty/',directory:true,content:'',size:0}]))[0].file.size,0)
  const native=['zip_directories.rs','zip_directory_plan.rs','zip_directory_io.rs'].map(name=>fs.readFileSync('src-tauri/src/'+name,'utf8')).join('\n'), safe=fs.readFileSync('src-tauri/src/safe_file_io.rs','utf8'), ui=fs.readFileSync('src/tools/components/ZipArchiveTool.vue','utf8'), lib=fs.readFileSync('src-tauri/src/lib.rs','utf8')
  for(const pattern of [/NtQueryDirectoryFile/,/info\.links != 1/,/Duration::from_secs\(60\)/,/context\.check\(\)\?/,/NewFile::create_at/,/safe_file_io::relative/,/self\.files\.clear\(\)/,/self\.directories\.pop\(\)/,/SetFileInformationByHandle/,/output\.file\.read_exact/,/output\.retain\(\)/,/MAX_ENTRIES: usize = 200/,/MAX_TOTAL: usize = 64/]) {assert.match(native,pattern);checks++}
  for(const forbidden of [/std::fs::(?:read|write|create_dir|remove_dir|remove_file)/,/Command::/,/canonicalize\(/,/File::open\(/]) {assert.doesNotMatch(native,forbidden);checks++}
  assert.match(safe,/if create \{2\} else \{1\}/); checks++
  assert.match(ui,/!confirmed\.value \|\| locked\.value \|\| disposed/);checks++
  assert.match(ui,/watch\(\[destination, folderName\]/);checks++
  for(const name of ['read_zip_directory','save_zip_directory']) {assert.match(lib,new RegExp(`zip_directories::${name}`));checks++}
  console.log(`${checks} ZIP tree, empty-directory, path/bomb budget and native source assertions passed; Windows IO untested`)
}
test().catch(e=>{console.error(e);process.exitCode=1})
