// Synthetic geometry only; no browser decoder, canvas rasterizer or user files.
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript')
const exportsObject = {}; let checks = 0
new Function('exports', ts.transpileModule(fs.readFileSync('src/tools/imageGeometry.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exportsObject)
const { validSize, resizeSize, cropGeometry } = exportsObject
const eq=(a,b)=>{assert.deepEqual(a,b);checks++}, bad=fn=>{assert.throws(fn);checks++}
const pixels={mode:'pixels',width:100,height:100,percent:50,keepAspect:true}
eq(resizeSize({width:400,height:200},pixels),{width:100,height:50})
eq(resizeSize({width:200,height:400},pixels),{width:50,height:100})
eq(resizeSize({width:400,height:200},{...pixels,keepAspect:false}),{width:100,height:100})
eq(resizeSize({width:3,height:1},{...pixels,mode:'percent',percent:50}),{width:2,height:1})
for(const n of [0,-1,NaN,Infinity,1.5,8193]) {bad(()=>validSize(n,1));bad(()=>validSize(1,n))}
bad(()=>validSize(4096,4096));eq(validSize(4000,4000),{width:4000,height:4000})
for(const percent of [0,-1,NaN,Infinity,801]) bad(()=>resizeSize({width:5,height:5},{...pixels,mode:'percent',percent}))
bad(()=>resizeSize({width:8192,height:1},{...pixels,mode:'percent',percent:200}))
eq(resizeSize({width:1000,height:1},{...pixels,width:8192,height:8192}),{width:8192,height:8})
const crop={x:1,y:2,width:3,height:2,rotation:0,flipX:false,flipY:false}
for(const rotation of [0,90,180,270]) for(const flipX of [false,true]) for(const flipY of [false,true]) {
  const size=cropGeometry({width:10,height:8},{...crop,rotation,flipX,flipY})
  eq(size,rotation%180?{width:2,height:3}:{width:3,height:2})
  // Independently transform all rectangle corners, including output-axis flips.
  const angle=rotation*Math.PI/180, points=[[-1.5,-1],[1.5,-1],[-1.5,1],[1.5,1]].map(([x,y])=>[
    (x*Math.cos(angle)-y*Math.sin(angle))*(flipX?-1:1)+size.width/2,
    (x*Math.sin(angle)+y*Math.cos(angle))*(flipY?-1:1)+size.height/2])
  for(const [x,y] of points) {assert.ok(x>=-1e-9&&x<=size.width+1e-9&&y>=-1e-9&&y<=size.height+1e-9);checks++}
}
for(const edit of [{x:-1},{y:-1},{x:.5},{width:0},{height:9},{x:8},{y:7},{rotation:45},{rotation:NaN}]) bad(()=>cropGeometry({width:10,height:8},{...crop,...edit}))
console.log(`${checks} synthetic image geometry assertions passed; Canvas rendering untested`)
