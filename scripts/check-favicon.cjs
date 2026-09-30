// Synthetic PNGs and ICO directory bytes; Canvas rasterization remains untested.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib')
const cache={};function load(name){if(cache[name])return cache[name];const e={};cache[name]=e;new Function('exports','require',ts.transpileModule(fs.readFileSync('src/tools/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,n=>load(n.replace('./','')));return e}
const {packIco,iconGeometry,validateIconFrame}=load('favicon'),{pngChunk,minimalExifTiff}=load('imageStripShared')
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},bad=fn=>{assert.throws(fn);checks++}
function png(size,extras=[]){const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,size);view.setUint32(4,size);header[8]=8;header[9]=6;const raw=Buffer.alloc(size*(size*4+1));for(let y=0;y<size;y++)for(let x=0;x<size;x++){const p=y*(size*4+1)+1+x*4;raw.set([235,34,187,x%2?128:255],p)}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),...extras,pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',new Uint8Array())])}
const sizes=[16,32,48,64,128,256],frames=sizes.map(size=>({size,bytes:png(size)})),ico=packIco(frames),view=new DataView(ico.buffer)
eq([view.getUint16(0,true),view.getUint16(2,true),view.getUint16(4,true)],[0,1,6]);let offset=102
frames.forEach((frame,i)=>{const p=6+i*16;eq([ico[p],ico[p+1],ico[p+2],ico[p+3]],[frame.size===256?0:frame.size,frame.size===256?0:frame.size,0,0]);eq([view.getUint16(p+4,true),view.getUint16(p+6,true)],[1,32]);eq(view.getUint32(p+8,true),frame.bytes.length);eq(view.getUint32(p+12,true),offset);eq(Buffer.from(ico.subarray(offset,offset+frame.bytes.length)),frame.bytes);offset+=frame.bytes.length});eq(offset,ico.length)
eq(iconGeometry(100,50,32,'contain'),{sx:0,sy:0,sw:100,sh:50,dx:0,dy:8,dw:32,dh:16});eq(iconGeometry(100,50,32,'cover'),{sx:25,sy:0,sw:50,sh:50,dx:0,dy:0,dw:32,dh:32})
eq(iconGeometry(50,100,32,'cover'),{sx:0,sy:25,sw:50,sh:50,dx:0,dy:0,dw:32,dh:32})
for(const args of [[0,1,32,'contain'],[8193,1,32,'contain'],[4096,4096,32,'contain'],[10,10,33,'contain'],[10,10,32,'bad']])bad(()=>iconGeometry(...args))
for(const badFrames of [[],[frames[0],frames[0]],[{size:512,bytes:png(512)}],[{size:32,bytes:frames[0].bytes}],[{size:16,bytes:png(16,[pngChunk('eXIf',minimalExifTiff(2))])}],Array(7).fill(frames[0])])bad(()=>packIco(badFrames))
validateIconFrame({size:512,bytes:png(512)});checks++
const badPng=Buffer.from(frames[0].bytes);badPng[badPng.length-1]^=1;bad(()=>packIco([{size:16,bytes:badPng}]))
const padded=png(16,[pngChunk('tEXt',new Uint8Array(2*1024*1024))]);bad(()=>packIco([{size:16,bytes:padded}]))
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'toolbox-favicon-synthetic-'));fs.writeFileSync(path.join(directory,'fixture.ico'),ico);frames.forEach(frame=>fs.writeFileSync(path.join(directory,frame.size+'.png'),frame.bytes))
console.log(`${checks} synthetic ICO layout/PNG payload/fit geometry/bounds assertions passed`);console.log('Independent decoder fixtures: '+directory)
