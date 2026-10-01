// Pure synthetic metadata and mocked lifecycle; never opens user directories.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a,b) => { assert.deepEqual(a,b); checks++ }, ok = a => { assert.ok(a); checks++ }
const compile = s => ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const load = p => { const e={}; new Function('exports','require',compile(fs.readFileSync(p,'utf8')))(e,n=>n==='./fileScan'?scan:{}); return e }
const scan=load('src/tools/fileScan.ts'), tree=load('src/tools/fileTree.ts')
const root='C:\\fixture', row={path:root+'\\a.txt',name:'a.txt',bytes:4,modifiedMs:0,kind:'file'}
const summary={summary:true,visited:1,skipped:0,limited:false}
const result=(rows, s=summary)=>({output:[...rows,s].map(JSON.stringify).join('\n'),status:'completed',exitCode:0,elapsedMs:1})
const snap=rows=>tree.treeSnapshot(root,result(rows))
const a=snap([row]), empty=snap([]), unknown=tree.treeSnapshot(root,null)
eq(a.complete,true);eq(a.rows[0].relative,'a.txt');eq(empty.complete,true);eq(unknown.complete,false)
for(const bad of [{...row,path:'C:\\else\\a.txt'},{...row,path:root+'2\\a.txt'},{...row,path:root+'\\..\\x'},{...row,path:root+'\\a:ads'},{...row,kind:'link'},{...row,kind:undefined}]) {eq(snap([bad]).complete,false);eq(snap([bad]).rows.length,0)}
for(const change of [{status:'cancelled'},{status:'timeout'},{status:'outputLimit'},{exitCode:1}]) eq(tree.treeSnapshot(root,{...result([row]),...change}).complete,false)
for(const s of [{...summary,skipped:1},{...summary,failed:true},{...summary,limited:true}]) eq(tree.treeSnapshot(root,result([row],s)).complete,false)
const status=(l,r)=>tree.compareTrees(l,r).map(r=>r.status)
eq(status(a,a),['metadataSame']);eq(status(a,empty),['leftOnly']);eq(status(empty,a),['rightOnly'])
eq(status(a,unknown),['unverifiedLeft']);eq(status(unknown,a),['unverifiedRight'])
eq(status(a,snap([{...row,bytes:5}])),['metadataChanged']);eq(status(a,snap([{...row,modifiedMs:1}])),['metadataChanged'])
eq(status(a,snap([{...row,kind:'directory'}])),['typeChanged'])
eq(status(snap([{...row,kind:'directory'}]),snap([{...row,kind:'directory',bytes:123}])),['metadataSame'])
eq(tree.compareTrees(a,snap([{...row,path:root+'\\A.txt'}])).length,2)
eq(tree.compareTrees(empty,empty),[])
ok(tree.comparisonLabels.metadataSame.includes('未比较内容'))
async function lifecycle() {
  const hooks=[], calls=[], tasks=[], e={}; let finish
  function task() { const t={result:{value:null},error:{value:''},summary:{value:''},clear(){t.result.value=null},async cancel(){calls.push('cancel')},async start(cmd,args){calls.push(args.request.root);await new Promise(r=>finish=r);t.result.value=result([row])}};tasks.push(t);return t }
  const source=fs.readFileSync('src/tools/components/FolderCompareTool.vue','utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
  new Function('exports','require',compile(source+'\nexport {run,cancel,leftRoot,rightRoot,busy};'))(e,n=>n==='vue'?{ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch(){},onBeforeUnmount:fn=>hooks.push(fn)}:n.includes('useNativeDiagnostic')?{useNativeDiagnostic:task}:n.includes('fileTree')?tree:n.includes('fileScan')?scan:{})
  await e.run();eq(calls,[])
  e.leftRoot.value=root;e.rightRoot.value='D:\\fixture'
  let op=e.run();await e.run();eq(calls,[root]);await e.cancel();finish();await op;eq(calls.includes('D:\\fixture'),false);eq(e.busy.value,false)
  op=e.run();finish();await new Promise(r=>setImmediate(r));eq(calls.at(-1),'D:\\fixture');finish();await op;eq(e.busy.value,false)
  op=e.run();hooks.forEach(fn=>fn());finish();await op;const count=calls.length;await e.run();eq(calls.length,count)
  console.log(`${checks} tree comparison checks passed; native Windows runtime not run`)
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1})
