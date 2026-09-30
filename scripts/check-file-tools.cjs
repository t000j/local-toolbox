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
async function lifecycle() {
 const e={}, hooks=[];let calls=0,resolve
 const source=read('src/tools/components/MonitorInfoTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
 new Function('exports','require',compile(source+'\nexport {read,rows,busy,error};'))(e,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('monitorInfo')?monitor:{trackedInvoke:()=>{calls++;return new Promise(r=>{resolve=r})}})
 const operation=e.read();await e.read();eq(calls,1);eq(e.busy.value,true)
 hooks.forEach(fn=>fn());resolve({monitors:[row]});await operation;eq(e.rows.value,[]);await e.read();eq(calls,1)
 console.log(`${checks} file-tool checks passed; native Windows compilation/runtime not run`)
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1})
