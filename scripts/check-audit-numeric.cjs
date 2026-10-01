// Synthetic inputs only; executes production pure functions and worker handlers.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript')
const cache=new Map();function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(`src/tools/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,id=>id.startsWith('.')?load(id.slice(2)):require(id));return exports}
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},ok=a=>{assert.ok(a);checks++},bad=(fn,re)=>{assert.throws(fn,re);checks++}
const json=load('safeJson'),{evaluate,formatNumber}=load('calculator'),{convertUnit,formatUnitValue}=load('unitConversion')
for(const source of ['{"id":9007199254740993}','{"id":9007199254740992}','{"n":1e400}','{"n":1e-400}','{"n":0.1234567890123456789}','{"n":-0}','{"x":1,"\\u0078":2}']) {
 bad(()=>json.formatSafeJson(source),/无法无损|重复键/);bad(()=>json.compareSafeJson(source,'{}'),/左侧/);bad(()=>json.compareSafeJson('{}',source),/右侧/)
}
for(const input of ['null','true','false','"🧪 \\uD800"','0','0.1','1.00','1e-7','5e-324','{"__proto__":{"x":1},"constructor":2,"q\\\"":[]}']) eq(json.formatSafeJson(input,true),JSON.stringify(JSON.parse(input)))
eq(json.compareSafeJson('{"b":2,"a":1}','{"a":1.0,"b":2}'),[])
const changes=json.compareSafeJson('{"a.b":1,"x":null,"old":true}','{"a.b":2,"x":[],"new":false}')
eq(changes.map(x=>[x.path,x.type]),[['$["a.b"]','changed'],['$.x','changed'],['$.old','removed'],['$.new','added']]);eq(changes[0].before,'1');eq(changes[0].after,'2')
for(const source of ['', ' ', '[1,]', '{"a":}', '{"a":1,}', '01', '1e', '+1', 'NaN', 'Infinity', 'true false', '"bad\nstring"', '"\\xFF"', '[[]', '"unterminated']) bad(()=>json.parseSafeJson(source),/语法/)
bad(()=>json.parseSafeJson('['.repeat(129)+'0'+']'.repeat(129)),/128/)
json.parseSafeJson('['.repeat(128)+'0'+']'.repeat(128));checks++
bad(()=>json.parseSafeJson(JSON.stringify(Array(50_000).fill(0))),/50,000/)
bad(()=>json.parseSafeJson('"'+'a'.repeat(1024*1024)+'"'),/1 MiB/)
bad(()=>json.parseSafeJson('"'+'汉'.repeat(400000)+'"'),/1 MiB/)
bad(()=>json.parseSafeJson('1e'+'9'.repeat(1024)),/过长/)
bad(()=>json.compareSafeJson(JSON.stringify(Array(1001).fill(0)),JSON.stringify(Array(1001).fill(1))),/1000/)
eq(json.compareSafeJson(JSON.stringify(Array(1000).fill(0)),JSON.stringify(Array(1000).fill(1))).length,1000)
for(const expression of ['1 / 10000000','1e-7','1E+20 / 10','-2.5e-7 * 10','(2 + 3) * 4','1.7976931348623157e308','5e-324']) { const result=formatNumber(evaluate(expression));ok(Number.isFinite(evaluate(result)));eq(formatNumber(evaluate(result)),result) }
eq(evaluate(formatNumber(evaluate('1/10000000'))+' * 10'),0.000001)
for(const expression of ['1e','1e+','1e2e3','1e400','1e-400','1/0','1e-300 * 1e-300','2**2','alert(1)']) bad(()=>evaluate(expression))
const B={id:'b',factor:1},GB={id:'gb',factor:1e9},GiB={id:'gib',factor:1073741824}
eq(formatUnitValue(convertUnit('1',false,B,GB)),'1e-9');ok(Number(formatUnitValue(convertUnit('1',false,B,GiB)))>0)
eq(convertUnit('1e308',false,GB,GB),1e308);eq(convertUnit('0',false,B,GB),0)
eq(convertUnit('32',true,{id:'f'},{id:'c'}),0);eq(convertUnit('100',true,{id:'c'},{id:'f'}),212)
for(const [source,from,to] of [['1e308',GB,B],['1e-400',B,GB],['5e-324',B,GB],['0x10',B,GB],['Infinity',B,GB]]) bad(()=>convertUnit(source,false,from,to))
const unicode=load('unicode');for(const n of [17000,100000]) for(const mode of ['utf16','codepoint']) {const value='A'.repeat(n);eq(unicode.decodeUnicode(unicode.encodeUnicode(value,mode)),value)}
bad(()=>unicode.decodeUnicode('A'.repeat(100001)),/100,000/);bad(()=>unicode.decodeUnicode('\\u0041'.repeat(100001)),/600,000/)
const {testRegex}=load('regex');for(const n of [499,500,501]) {const r=testRegex({input:'a'.repeat(n),pattern:'a',flags:'g'});eq(r.matches.length,Math.min(500,n));eq(r.truncated,n>500)}
// Production JSONPath worker must reject original lexeme loss before running query.
let response;globalThis.postMessage=r=>response=r;load('jsonPath.worker')
for(const input of ['{"n":1e-400}','{"n":0.1234567890123456789}','{"n":1,"n":2}']) {globalThis.onmessage({data:{input,expression:'$.n'}});eq(response.ok,false)}
globalThis.onmessage({data:{input:'{"n":0.1}',expression:'$.n'}});eq(response.ok,true);eq(response.result.valuesJson,'[0.1]')
console.log(`${checks} numeric/JSON/Unicode/regex audit regression assertions passed; synthetic, no native effects`)
