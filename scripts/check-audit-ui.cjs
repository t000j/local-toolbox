// Actual Vue refs/computed/watch plus deferred Workers/IPC, synthetic Canvas only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),vue=require('vue')
const compile=s=>ts.transpileModule(s.replace(/new URL\([^)]*import.meta.url\)/g,"'worker'"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=a=>{assert.ok(a);checks++}
function harness(file,names,extra={}) {
 const hooks=[],workers=[],calls=[],cache=new Map(),clipboard=[];let finishCopy
 const mockedVue={...vue,onBeforeUnmount:fn=>hooks.push(fn)}
 class Worker {constructor(){workers.push(this)} postMessage(request){this.request=request} terminate(){this.stopped=true}}
 const copyText=text=>{clipboard.push(text);return new Promise(resolve=>finishCopy=resolve)}
 const invoke=(command,args)=>new Promise((resolve,reject)=>calls.push({command,args,resolve,reject}))
 function load(name){if(cache.has(name))return cache.get(name);const e={};cache.set(name,e);const source=fs.readFileSync(name,'utf8');new Function('exports','require','Worker',compile(source))(e,id=>resolve(id,name),Worker);return e}
 function resolve(id,parent){if(id==='vue')return mockedVue;if(id.endsWith('/clipboard'))return {copyText};if(id.endsWith('/activity'))return {trackedInvoke:invoke};if(extra[id])return extra[id];if(id.startsWith('@'))return {};const full=path.resolve(path.dirname(parent),id+'.ts');return load(full)}
 const e={};let source=fs.readFileSync(file,'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];new Function('exports','require','Worker',compile(source+'\nexport {'+names+'};'))(e,id=>resolve(id,path.resolve(file)),Worker)
 return {e,hooks,workers,calls,clipboard,finishCopy:()=>finishCopy(),load}
}
async function main(){
 const f=harness('src/tools/components/JsonFormatterTool.vue','input,output,error,copied,busy,formatJson,copyOutput,clearAll'),j=f.e
 j.formatJson();eq(f.workers.length,1);const old=f.workers[0];j.input.value='{"next":2}';eq(old.stopped,true);old.onmessage({data:{ok:true,result:'stale'}});eq(j.output.value,null)
 j.formatJson();f.workers[1].onmessage({data:{ok:true,result:'{"next":2}'}});const copying=j.copyOutput();j.input.value='{';f.finishCopy();await copying;eq(j.copied.value,false);eq(j.output.value,null);eq(j.error.value,'');j.clearAll();eq(j.input.value,'')
 j.formatJson();f.hooks.forEach(fn=>fn());ok(f.workers.at(-1).stopped)
 const r=harness('src/tools/components/BatchRenameTool.vue','selectedPaths,prefix,previews,confirmedPlan,loading,confirmationOpen,canApply,createPreview,renameFiles,error'),b=r.e
 b.selectedPaths.value=['C:\\fixture\\report.txt'];b.prefix.value='old-';const preview=b.createPreview();await b.createPreview();eq(r.calls.length,1);b.prefix.value='new-';const row={oldPath:'C:\\fixture\\report.txt',newPath:'C:\\fixture\\old-report.txt',oldName:'report.txt',newName:'old-report.txt',sizeBytes:3,status:'ready',reason:null,sourceStamp:'same-object-v1'};r.calls[0].resolve([row]);await preview;eq(b.previews.value,[]);eq(b.canApply.value,false)
 b.prefix.value='old-';const fresh=b.createPreview();r.calls[1].resolve([row]);await fresh;eq(b.canApply.value,true);await b.renameFiles();eq(r.calls.length,2);b.confirmationOpen.value=true;const rename=b.renameFiles();await b.renameFiles();eq(r.calls.length,3);eq(r.calls[2].args.rule.prefix,'old-');eq(r.calls[2].args.expectedPreviews,[row]);b.prefix.value='changed-after-submit';eq(r.calls[2].args.rule.prefix,'old-');r.calls[2].reject(new Error('identity changed'));await rename;eq(b.confirmedPlan.value,null);eq(b.previews.value,[]);ok(b.error.value.includes('重新预览'))
 b.prefix.value='final-';const late=b.createPreview();r.hooks.forEach(fn=>fn());r.calls[3].resolve([row]);await late;eq(b.previews.value,[])
 const canvasCalls=[];global.document={createElement:tag=>{assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>new Proxy({}, {get:(_,key)=>(...args)=>canvasCalls.push([key,...args])}),toBlob:callback=>callback(new Blob(['synthetic png']))}}}
 const a=harness('src/tools/components/ScreenshotAnnotationTool.vue','sourceBitmap,sourceWidth,sourceHeight,pendingTextPoint,textDraft,annotations,isDrawing,exportBlob,hasUnsavedChanges,savedAnnotations,saveAnnotatedImage',{'@tauri-apps/api/window':{getCurrentWindow:()=>({})}}),s=a.e
 s.sourceBitmap.value={width:100,height:100,close(){}};s.sourceWidth.value=100;s.sourceHeight.value=100;s.pendingTextPoint.value={x:20,y:20};s.textDraft.value='draft';assert.throws(()=>s.exportBlob(),/待编辑/);checks++;eq(await s.saveAnnotatedImage(),false);eq(s.textDraft.value,'draft');eq(canvasCalls.length,0)
 s.pendingTextPoint.value=null;s.isDrawing.value=true;assert.throws(()=>s.exportBlob(),/完成/);checks++;s.isDrawing.value=false;s.annotations.value=[{id:'test',kind:'text',point:{x:10,y:10},text:'committed',color:'#000',fontSize:20}];ok(s.hasUnsavedChanges.value);await s.exportBlob();ok(canvasCalls.some(call=>call[0]==='fillText'&&call[1]==='committed'));eq(canvasCalls.filter(call=>call[0]==='arc').length,0);s.savedAnnotations.value=JSON.stringify(s.annotations.value);eq(s.hasUnsavedChanges.value,false)
 const nav=a.load(path.resolve('src/app/toolNavigation.ts'));let navigated=0;s.annotations.value=[];nav.requestToolNavigation(()=>navigated++);ok(nav.pendingNavigation.value);nav.cancelToolNavigation();eq(navigated,0);nav.requestToolNavigation(()=>navigated++);nav.discardAndNavigate();eq(navigated,1)
 let dirty=true,busy=false,saves=0;nav.useToolLeaveGuard({label:'synthetic',dirty:()=>dirty,busy:()=>busy,save:async()=>{saves++;return false}});nav.requestToolNavigation(()=>navigated++);await nav.saveAndNavigate();eq(navigated,1);eq(saves,1);ok(nav.pendingNavigation.value);busy=true;nav.discardAndNavigate();eq(navigated,1);busy=false;nav.cancelToolNavigation()
 nav.useToolLeaveGuard({label:'synthetic',dirty:()=>dirty,save:async()=>{dirty=false;return true}});nav.requestToolNavigation(()=>navigated++);await nav.saveAndNavigate();eq(navigated,2);eq(nav.pendingNavigation.value,null)
 // Saving a snippet replaces its object. Deferred navigation must resolve its current ID.
 const storage=new Map();global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};global.window={clearTimeout,setTimeout}
 const sn=harness('src/tools/components/TextSnippetTool.vue','snippets,title,content,editorOpen,editingId,editSnippet,requestEditSnippet,draftDirty'),snip=sn.e
 snip.snippets.value=[{id:'one',title:'Original',content:'old body',updatedAt:1}];snip.editSnippet(snip.snippets.value[0]);snip.content.value='new body'
 const snav=sn.load(path.resolve('src/app/toolNavigation.ts'));snip.requestEditSnippet('one');ok(snav.pendingNavigation.value);await snav.saveAndNavigate()
 eq(snip.snippets.value[0].content,'new body');eq(snip.content.value,'new body');eq(snip.editingId.value,'one');eq(snip.draftDirty.value,false);eq(snav.pendingNavigation.value,null);sn.hooks.forEach(fn=>fn())
 // Module-owned timer state survives page destruction; fake monotonic time and interval.
 let now=1000,interval,clears=0;const timerExports={};new Function('exports','require','performance','setInterval','clearInterval',compile(fs.readFileSync('src/tools/timerSession.ts','utf8')))(timerExports,()=>vue,{now:()=>now},fn=>{interval=fn;return 1},()=>{clears++;interval=null});const t=timerExports.timerSession
 t.countdownMinutes.value=0;t.countdownSeconds.value=2;t.updateConfiguredDuration();t.toggleCountdown();eq(t.countdownRunning.value,true);now=2000;interval();eq(t.countdownDisplay.value,1000);t.mode.value='stopwatch';t.toggleStopwatch();now=3500;interval();eq(t.countdownFinished.value,true);eq(t.countdownRunning.value,false);eq(t.stopwatchRunning.value,true);eq(t.stopwatchDisplay.value,1500)
 for(let i=0;i<25;i++){now+=100;t.recordLap()}eq(t.laps.value.length,20);eq(t.laps.value[0].id,25);t.toggleStopwatch();ok(clears>0);t.resetStopwatch();t.toggleStopwatch();t.recordLap();eq(t.laps.value[0].id,1);timerExports.stopSessionTicker()
 for(const h of [f,r,a])h.hooks.forEach(fn=>fn())
 console.log(`${checks} audit component/worker/navigation/timer simulation assertions passed; native IO and real UI untested`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
