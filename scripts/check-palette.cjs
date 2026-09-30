const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),e={}
new Function('exports',ts.transpileModule(fs.readFileSync('src/tools/palette.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e)
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},bad=fn=>{assert.throws(fn);checks++},rgba=(...pixels)=>new Uint8ClampedArray(pixels.flat())
let r=e.extractPalette(rgba([255,0,0,255],[255,0,0,255],[0,0,255,255],[0,255,0,0]),2,1)
eq(r.colors.map(c=>c.hex),['#FF0000','#0000FF']);eq(r.includedPixels,3);eq(r.sampledPixels,4);assert.ok(Math.abs(r.colors[0].percent-200/3)<1e-10);checks++
r=e.extractPalette(rgba([255,0,0,255],[0,0,255,128]),2,1);eq(r.colors.map(c=>c.weight),[255,128]);eq(r.colors.reduce((s,c)=>s+c.percent,0),100)
r=e.extractPalette(rgba([255,0,0,255],[0,0,255,128]),16,200);eq(r.colors.length,1);eq(r.colors[0].hex,'#FF0000')
eq(e.extractPalette(rgba([255,0,0,255],[0,0,255,255]),1,1).colors[0].hex,'#800080')
eq(e.paletteSampleSize(4000,2000),{width:256,height:128});eq(e.paletteSampleSize(1,8192),{width:1,height:256});eq(e.paletteSampleSize(3,2),{width:3,height:2})
for(const [n,a] of [[0,1],[17,1],[1,0],[1,256],[NaN,1],[1,1.5]])bad(()=>e.extractPalette(rgba([1,2,3,255]),n,a))
for(const p of [new Uint8ClampedArray(),new Uint8ClampedArray(5),new Uint8ClampedArray(256*256*4+4),rgba([255,0,0,0])])bad(()=>e.extractPalette(p,4,1))
for(const size of [[0,1],[8193,1],[4096,4096],[NaN,1]])bad(()=>e.paletteSampleSize(...size))
const pixels=new Uint8ClampedArray(256*256*4);let seed=12345
for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24}
for(const count of [1,2,4,8,16]){
 const output=e.extractPalette(pixels,count,16);eq(output,e.extractPalette(pixels,count,16));assert.ok(output.colors.length<=count);checks++
 assert.ok(Math.abs(output.colors.reduce((sum,c)=>sum+c.percent,0)-100)<1e-8);checks++
 for(const color of output.colors){assert.match(color.hex,/^#[0-9A-F]{6}$/);checks++;assert.ok(color.weight>0&&color.percent>0);checks++}
}
console.log(`${checks} synthetic palette/alpha/quantization/bounds assertions passed; Canvas sampling untested`)
