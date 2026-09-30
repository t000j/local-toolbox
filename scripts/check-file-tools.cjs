// Pure parser/layout checks and mocked UI lifecycle. Never scans a real filesystem.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a,b) => { assert.deepEqual(a,b); checks++ }, ok = a => { assert.ok(a); checks++ }
const read = p => fs.readFileSync(p,'utf8')
const compile = s => ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const load = p => { const e={}; new Function('exports',compile(read(p)))(e);return e }
const monitor = load('src/tools/monitorInfo.ts')
const row = {name:'示例屏幕', x:-1920,y:0,width:1920,height:1080,scale:1.25,primary:false}
eq(monitor.parseMonitors({monitors:[row],limited:false}).monitors,[row])
for(const bad of [{...row,width:0},{...row,scale:NaN},{...row,x:Infinity},{...row,primary:1},{...row,name:1},{...row,height:100001}]) {
 const r=monitor.parseMonitors({monitors:[bad]});eq(r.monitors.length,0);eq(r.limited,true)
}
eq(monitor.parseMonitors({monitors:Array(33).fill(row)}).monitors.length,32)
eq(monitor.parseMonitors({monitors:Array(33).fill(row)}).limited,true)
assert.throws(()=>monitor.parseMonitors(null));checks++
eq(monitor.monitorLayout([]).rows,[])
const layout=monitor.monitorLayout([row,{...row,x:0,y:-1080,primary:true}])
ok(layout.rows.every(r=>r.left>=20&&r.top>=20&&r.w>0&&r.h>0));eq(layout.rows[0].left,20)
ok(layout.rows[1].top===20);ok(layout.rows[0].top>layout.rows[1].top)
const scan = load('src/tools/fileScan.ts')
const file = {path:'C:\\fixture\\a.txt',name:'a.txt',bytes:4,modifiedMs:1234}
const summary = {summary:true,visited:2,skipped:0,limited:false}
const parse = items=>scan.parseFileScan(items.map(r=>JSON.stringify(r)).join('\n'))
eq(parse([file,summary]).rows,[file]);eq(parse([file,summary]).limited,false)
eq(parse([file]).limited,true);eq(parse([file,file,summary]).rows.length,1)
for(const invalid of [null,{},[],{...file,bytes:-1},{...file,modifiedMs:'date'},{...file,hash:'bad'},{...file,path:''}]) {eq(parse([invalid,summary]).rows.length,0);eq(parse([invalid,summary]).limited,true)}
eq(parse([{...summary,skipped:1}]).limited,true);eq(parse([{...summary,limited:true}]).limited,true)
eq(scan.parseFileScan('{partial').limited,true)
const hash='a'.repeat(64),other='b'.repeat(64)
eq(scan.duplicateGroups([file]),[])
eq(scan.duplicateGroups([{...file,hash},{...file,path:'C:\\fixture\\b.txt',hash:other}]),[])
eq(scan.duplicateGroups([{...file,hash},{...file,path:'C:\\fixture\\b.txt',hash:hash.toUpperCase()}]).length,1)
eq(scan.duplicateGroups([{...file,hash},{...file,path:'C:\\fixture\\b.txt',bytes:5,hash}]),[])
eq(scan.scanFilters('literal[*]', '.TXT', '', '', '', ''),{name:'literal[*]',extension:'TXT',minBytes:null,maxBytes:null,afterMs:null,beforeMs:null})
for(const args of [['','','-1','','',''],['','','2','1','',''],['','*.txt','','','',''],['','tar.gz','','','',''],['','','9007199254740992','','',''],['','','','','bad',''],['','','','','2026-02-01','2026-01-01'],['x'.repeat(201),'','','','','']]) {assert.throws(()=>scan.scanFilters(...args));checks++}
eq(scan.scanFilters('','','0','0','','').minBytes,0)
const native = read('src-tauri/src/native_scripts/file_scan.ps1'), rust = read('src-tauri/src/file_scan.rs')
const compact = native.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')&&!s.startsWith('//')).join('\n')
ok((compact.length+700)*8/3+300<32767)
for(const text of ['NtCreateFile','GetFileInformationByHandleEx','SHA256.Create()','FILE_SHARE_READ','OPEN_REPARSE_POINT','visited>=10000','dirs.Count>=1000','parent.depth>=32','rows>=1000','64L*1024*1024','512L*1024*1024','sha.TransformFinalBlock','GetFinalPathNameByHandle','Same(item,Check(h,false),Change(h))']) ok(native.includes(text))
ok(!/Get-ChildItem|Remove-Item|Move-Item|DeleteFile|WriteFile|Invoke-Expression|Start-Process/.test(native))
for(const text of ['acquire_job(&job_id)','execute_script(&lease','Duration::from_secs(30)','deny_unknown_fields','Option<i64>','compact_script()']) ok(rust.includes(text))
async function scanLifecycle() {
 const e={},hooks=[]; let pick, invoked=[]
 const task={busy:{value:false},cancelling:{value:false},error:{value:''},result:{value:null},summary:{value:''},clear(){}, async start(command,args){invoked.push({command,args})}}
 const source=read('src/tools/components/FileScanPanel.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require','defineProps',compile(source+'\nexport {choose,run,root,name,min,max,notice,choosing};'))(e,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch(){},onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('plugin-dialog')?{open:()=>new Promise(r=>{pick=r})}:n.includes('fileScan')?scan:n.includes('useNativeDiagnostic')?{useNativeDiagnostic:()=>task}:{},()=>({mode:'search'}))
 await e.run();eq(invoked.length,0)
 let op=e.choose();eq(e.choosing.value,true);pick('C:\\fixture');await op;eq(e.root.value,'C:\\fixture')
 e.min.value='5';e.max.value='1';await e.run();eq(invoked.length,0);ok(e.notice.value.length>0)
 e.min.value='';e.max.value='';await e.run();eq(invoked.length,1);eq(invoked[0].command,'run_file_scan');eq(invoked[0].args.request.root,'C:\\fixture');eq(invoked[0].args.request.mode,'search')
 task.busy.value=true;await e.run();await e.choose();eq(invoked.length,1);eq(e.choosing.value,false)
 task.busy.value=false;op=e.choose();hooks.forEach(fn=>fn());pick('C:\\ignored');await op;eq(e.root.value,'');await e.run();eq(invoked.length,1)
}
async function lifecycle() {
 const e={}, hooks=[];let calls=0,resolve
 const source=read('src/tools/components/MonitorInfoTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require',compile(source+'\nexport {read,rows,busy,error};'))(e,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('monitorInfo')?monitor:{trackedInvoke:()=>{calls++;return new Promise(r=>{resolve=r})}})
 const operation=e.read();await e.read();eq(calls,1);eq(e.busy.value,true)
 hooks.forEach(fn=>fn());resolve({monitors:[row]});await operation;eq(e.rows.value,[]);await e.read();eq(calls,1)
 await scanLifecycle()
 console.log(`${checks} file-tool checks passed; native Windows compilation/runtime not run`)
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1})
