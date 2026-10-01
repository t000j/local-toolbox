// Pure UI validation and mocked flow plus native source guardrails.
// Rust streaming/Windows IO have separate unexecuted cargo fixture tests.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=a=>{assert.ok(a);checks++},read=p=>fs.readFileSync(p,'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const parts={};new Function('exports',compile(read('src/tools/fileParts.ts')))(parts)
eq(parts.chunkBytes(1),1048576);eq(parts.chunkBytes(64),67108864)
for(const n of [0,-1,65,1.5,NaN,Infinity,'1']){assert.throws(()=>parts.chunkBytes(n));checks++}
for(const p of ['valid','1-_ABC','x'.repeat(64)]) eq(parts.partPrefix(p),p)
for(const p of ['','x'.repeat(65),'a/b','..','a.b','a b','a:ads','中文']) {assert.throws(()=>parts.partPrefix(p));checks++}
const outcome={mode:'split',bytes:123,partCount:1,outputPath:'C:\\fixture\\split.manifest.json',sha256:'a'.repeat(64)}
eq(parts.parsePartsOutcome(JSON.stringify(outcome)),outcome)
for(const r of [null,{}, {...outcome,mode:'bad'},{...outcome,bytes:-1},{...outcome,bytes:512*1024*1024+1},{...outcome,partCount:0},{...outcome,partCount:513},{...outcome,sha256:'bad'},{...outcome,outputPath:''}])eq(parts.parsePartsOutcome(JSON.stringify(r)),null)
eq(parts.parsePartsOutcome('{'),null)
const native=read('src-tauri/src/file_parts.rs'),manifest=read('src-tauri/src/file_parts_manifest.rs'),stream=read('src-tauri/src/file_parts_stream.rs'),io=read('src-tauri/src/safe_file_io.rs')
for(const text of ['acquire_job(&job_id)?','stamp(&input)?!=before','stamp(&source)?!=before','manifest.validate()?','part.bytes','hash.eq_ignore_ascii_case(&part.sha256)','hash.eq_ignore_ascii_case(&manifest.sha256)','verify_output','directory.create','parent.create','256*1024'])ok(native.includes(text))
for(const text of ['512*1024*1024','64*1024*1024','count>512','p.index!=i+1','p.name!=part_name','p.bytes!=bytes','deny_unknown_fields','schema_version!=1','valid_hash(&self.sha256)'])ok(manifest.includes(text))
for(const text of ['256*1024','Duration::from_secs(120)','self.lease.cancelled()','read_exact','write_all','Sha256::new()','SeekFrom::Start(0)','output.retain()','output.accept()'])ok(stream.includes(text))
ok(stream.indexOf('context.check()?;\n    // Commit')<stream.indexOf('output.retain()'))
ok(stream.indexOf('output.retain()')<stream.indexOf('output.accept()'))
ok(!/fs::(write|remove|rename|copy)|File::open|OpenOptions/.test(native+stream))
ok(io.includes('if create {2} else {1}'));ok(io.includes('new.mark_delete(true)?'));ok(io.includes('if !self.committed'))
ok(read('src-tauri/Cargo.toml').includes('sha2 = "0.10.9"'));ok(read('src-tauri/Cargo.lock').includes('name = "sha2"\nversion = "0.10.9"'))
async function lifecycle(){
 const view={},hooks=[],calls=[];let finish,pick
 const task={busy:{value:false},cancelling:{value:false},error:{value:''},result:{value:null},summary:{value:''},clear(){},async start(command,args){task.busy.value=true;calls.push({command,args});await new Promise(r=>finish=r);task.busy.value=false}}
 const source=read('src/tools/components/FilePartsTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require',compile(source+'\nexport {run,choose,mode,source,destination,prefix,size,confirmed,notice,manifest,output};'))(view,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch(){},onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('plugin-dialog')?{open:()=>new Promise(r=>pick=r),save:()=>new Promise(r=>pick=r)}:n.includes('useNativeDiagnostic')?{useNativeDiagnostic:()=>task}:n.includes('fileParts')?parts:{})
 view.source.value='C:\\fixture\\a.bin';view.destination.value='D:\\fixture';await view.run();eq(calls.length,0)
 view.confirmed.value=true;view.size.value=0;await view.run();eq(calls.length,0);ok(view.notice.value.length>0)
 view.size.value=1;let op=view.run();await view.run();eq(calls.length,1);eq(calls[0].args.request.chunkBytes,1048576);eq(view.confirmed.value,false);finish();await op
 view.mode.value='merge';view.manifest.value='C:\\fixture\\split.manifest.json';view.output.value='D:\\fixture\\merged.bin';view.confirmed.value=true
 op=view.run();eq(calls[1].args.request.mode,'merge');finish();await op
 op=view.choose('source');hooks.forEach(fn=>fn());pick('C:\\late\\ignored');await op;eq(view.source.value,'C:\\fixture\\a.bin');await view.run();eq(calls.length,2)
 console.log(`${checks} file-parts UI/lifecycle/source checks passed; Rust and Windows IO tests not run`)
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1})
