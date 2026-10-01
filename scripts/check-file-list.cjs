// Synthetic strings and mocked save dialog only. No real user paths are opened.
const fs=require('node:fs'), assert=require('node:assert/strict'), ts=require('typescript')
let checks=0
const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=a=>{assert.ok(a);checks++}
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const e={};new Function('exports',compile(fs.readFileSync('src/tools/fileList.ts','utf8')))(e)
for(const value of ['=1+2','+SUM(A1)','-1+2','@test','  =cmd','\tname','\rname','\nname','\u3000=1']) ok(e.csvCell(value).startsWith('"\''))
eq(e.csvCell('a"b\nc'),'"a""b\nc"');eq(e.csvCell('normal'),'"normal"')
const row={relative:'=SUM(A1)',kind:'file',bytes:4,modifiedMs:0}, snapshot={rows:[row,{...row,relative:'empty',kind:'directory'}],complete:true,skipped:0,reasons:[]}
const csv=e.fileListText('C:\\fixture',snapshot,'csv'), text=e.fileListText('C:\\fixture',snapshot,'txt')
ok(csv.startsWith('\uFEFF'));ok(csv.includes('\r\n'));ok(csv.includes('"\'=SUM(A1)"'));ok(csv.includes('1970-01-01T00:00:00.000Z'));ok(csv.includes('"directory",""'));ok(text.includes('[DIR] "empty"'))
ok(e.fileListText('C:\\fixture',{...snapshot,complete:false},'csv').includes('INCOMPLETE'))
ok(e.fileListText('C:\\fixture',{...snapshot,rows:[]},'csv').includes('"summary"'))
ok(e.fileListText('C:\\fixture',{...snapshot,rows:[{...row,relative:'line\nname'}]},'txt').includes('"line\\nname"'))
assert.throws(()=>e.fileListText('x'.repeat(1024*1024),snapshot,'csv'));checks++
const native=fs.readFileSync('src-tauri/src/safe_file_io.rs','utf8')
for(const s of ['attrs:0x1000','if create {2} else {1}','0x600020','Directory','GetFinalPathNameByHandleW','new.mark_delete(true)?','self.mark_delete(false)','self.committed=true','impl Drop for NewFile','GetFileInformationByHandleEx','0x110183']) ok(native.includes(s))
ok(!/remove_file|File::open|OpenOptions|canonicalize|FILE_DELETE_ON_CLOSE/.test(native))
const exportSource=fs.readFileSync('src-tauri/src/file_export.rs','utf8');ok(exportSource.includes('1024*1024'));ok(exportSource.includes('output.persist()?; output.accept()'))
async function lifecycle() {
 const hooks=[], view={}, task={busy:{value:false},error:{value:''},result:{value:{}},summary:{value:''},clear(){},cancel(){},start(){}};let dialogResolve,writes=0
 const source=fs.readFileSync('src/tools/components/FileListTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require',compile(source+'\nexport {exportList,allowPartial,root,saving};'))(view,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch(){},onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('plugin-dialog')?{save:()=>new Promise(r=>dialogResolve=r)}:n.includes('activity')?{trackedInvoke:async()=>{writes++}}:n.includes('fileList')?e:n.includes('fileTree')?{treeSnapshot:()=>({...snapshot,complete:false})}:n.includes('useNativeDiagnostic')?{useNativeDiagnostic:()=>task}:{})
 await view.exportList();eq(writes,0);eq(view.saving.value,false)
 view.allowPartial.value=true;let op=view.exportList();await view.exportList();eq(view.saving.value,true);dialogResolve(null);await op;eq(writes,0)
 op=view.exportList();dialogResolve('C:\\fixture\\list.csv');await op;eq(writes,1)
 op=view.exportList();hooks.forEach(fn=>fn());dialogResolve('C:\\fixture\\late.csv');await op;eq(writes,1)
 console.log(`${checks} file-list and safe-output source/lifecycle checks passed; native Windows IO not run`)
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1})
