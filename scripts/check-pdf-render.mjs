// Actual PDF.js rendering on synthetic fixtures with optional Node canvas.
// This is NOT browser/WebView/Worker/UI validation.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),canvas=require('@napi-rs/canvas')
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D})
const {getDocument,AnnotationMode}=await import('pdfjs-dist/legacy/build/pdf.mjs')
const dir='/tmp/local-toolbox-pdf-pages-check'
class LocalFonts {async fetch({kind,filename}){assert.equal(kind,'standardFontDataUrl');assert.match(filename,/^[A-Za-z-]+\.(ttf|pfb)$/);return new Uint8Array(fs.readFileSync(path.join('node_modules/pdfjs-dist/standard_fonts',filename)))}}
async function render(filename){const task=getDocument({data:new Uint8Array(fs.readFileSync(filename)),BinaryDataFactory:LocalFonts,useWorkerFetch:false,useWasm:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,stopAtErrors:true,maxImageSize:1048576,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,verbosity:0});try{const doc=await task.promise,out=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),base=p.getViewport({scale:1}),viewport=p.getViewport({scale:256/Math.max(base.width,base.height)}),c=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await p.render({canvas:c,viewport,annotationMode:AnnotationMode.DISABLE,background:'rgb(255,255,255)'}).promise;out.push({width:c.width,height:c.height,rgba:Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)});fs.writeFileSync(filename+`-thumb${n}.png`,c.toBuffer('image/png'));p.cleanup()}return out}finally{await task.destroy()}}
const source=await render(dir+'/source.pdf'),split=await render(dir+'/split.pdf');assert.deepEqual(split[0],source[3]);assert.deepEqual(split[1],source[1]);assert.ok(source.every(p=>p.rgba.some((n,i)=>i%4!==3&&n<128)));const ordered=await render(dir+'/ordered.pdf');for(const [i,n] of [3,1,4,2].entries())assert.deepEqual(ordered[i],source[n-1]);console.log('PDF.js 6.2.108 independently rendered all four synthetic pages; extracted pages match source RGBA exactly. Browser UI/worker/native-save untested.')
