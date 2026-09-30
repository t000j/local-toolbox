const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),e={}
new Function('exports',ts.transpileModule(fs.readFileSync('src/tools/colorFormats.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e)
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},close=(a,b,t=1e-5)=>{assert.ok(Math.abs(a-b)<=t,`${a} differs from ${b}`);checks++},bad=s=>{assert.throws(()=>e.parseColor(s));checks++}
for(const [input,hex] of [['#abc','#AABBCC'],['#abcd','#AABBCCDD'],['#11223344','#11223344'],['rgb(255, 0, 128)','#FF0080'],['rgba(255,0,128,.5)','#FF008080'],['rgb(100% 0% 50% / 0%)','#FF008000'],['hsl(120 100% 50%)','#00FF00'],['hsl(-120deg 100% 50%)','#0000FF'],['hsl(.5turn 100% 50% / 50%)','#00FFFF80'],['hsl(200grad 100% 50%)','#00FFFF'],['hsl(3.141592653589793rad 100% 50%)','#00FFFF'],['hsl(720 0% 50%)','#808080']]) eq(e.formatColor(e.parseColor(input)).hex,hex)
for(const input of ['', '#12','#12345','#1234567','#ggg','red','transparent','rgb(256 0 0)','rgb(-1 0 0)','rgb(10% 0 0)','rgb(1,2,3 / .5)','rgb(1 2 3 / 2)','rgb(1 2 3 / -1%)','rgb(1 2 3 /)','rgb(1 2 3 / 1 / 1)','rgb(NaN 1 2)','rgb(1e2 1 2)','rgb(1 2 3 4)','hsl(0 100 50)','hsl(0 101% 50%)','hsl(Infinity 0% 0%)','color(display-p3 1 0 0)','rgb(calc(1) 0 0)','x'.repeat(257),'<img>','hsl(1e99 0% 0%)']) bad(input)
for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
 const color={r,g,b,a:0.314159},hsl=e.rgbToHsl(color),rgb=e.hslToRgb(...hsl,color.a)
 for(const key of ['r','g','b','a'])close(rgb[key],color[key])
 const out=e.formatColor(color),fromRgb=e.parseColor(out.rgb),fromHsl=e.parseColor(out.hsl),fromHex=e.parseColor(out.hex8)
 for(const key of ['r','g','b','a']){close(fromRgb[key],color[key]);close(fromHsl[key],color[key],0.0001)}
 close(fromHex.a,color.a,0.5/255);eq([fromHex.r,fromHex.g,fromHex.b],[r,g,b])
}
for(let a=0;a<256;a++)eq(e.formatColor(e.parseColor('#123456'+a.toString(16).padStart(2,'0'))).hex8,'#123456'+a.toString(16).padStart(2,'0').toUpperCase())
for(const edit of [{r:-1},{g:256},{b:NaN},{a:Infinity},{a:-.1},{a:1.1}]){assert.throws(()=>e.formatColor({r:0,g:0,b:0,a:1,...edit}));checks++}
eq(e.formatColor(e.parseColor('#ff000000')).rgb,'rgb(255 0 0 / 0)')
console.log(`${checks} synthetic color parsing/conversion/round-trip assertions passed`)
