// Safe source/mock checks only. Never executes PowerShell, Rust or any service API.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = v => { assert.ok(v); checks++ }
const read = p => fs.readFileSync(p, 'utf8')
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(file) { const e = {}; new Function('exports', compile(read(file)))(e); return e }
const api = load('src/tools/serviceDependencies.ts'), manager = load('src/tools/systemManager.ts')
const entry = (name, state, links = []) => ({ name, displayName: `显示 ${name}`, state, nextState: 'Running', links })
const plan = { plan: true, name: 'App', action: 'start', expected: 'Stopped', fingerprint: 'a'.repeat(64),
  services: [entry('Shared', 'Running'), entry('Dependency', 'Stopped', ['Shared']), entry('App', 'Stopped', ['Dependency', 'Shared'])] }
const parse = value => api.parseServicePlan(JSON.stringify(value), value?.name ?? 'App', value?.action ?? 'start')
const copy = o => JSON.parse(JSON.stringify(o))
eq(parse(plan), plan)
eq(api.serviceApplyRequest(plan), { action: 'start', name: 'App', expected: 'Stopped', confirmed: true,
  fingerprint: plan.fingerprint, names: ['Shared', 'Dependency', 'App'] })
const stop = { ...copy(plan), action: 'stop', expected: 'Running', services: [
  { ...entry('Leaf', 'Stopped'), nextState: 'Stopped' },
  { ...entry('Dependent', 'Running', ['Leaf']), nextState: 'Stopped' },
  { ...entry('App', 'Running', ['Dependent']), nextState: 'Stopped' },
] }
eq(parse(stop), stop)
for (const action of ['start', 'stop']) for (let size = 1; size <= 32; size++) {
  const services = Array.from({ length: size }, (_, i) => ({ name: `s${i}`, displayName: '',
    state: action === 'start' ? 'Stopped' : 'Running', nextState: action === 'start' ? 'Running' : 'Stopped', links: i ? [`s${i - 1}`] : [] }))
  const p = { ...plan, name: services.at(-1).name, expected: services.at(-1).state, action, services }
  eq(parse(p), p)
}
for (const value of [null, {}, [], { ...plan, plan: false }, { ...plan, extra: true },
  { ...plan, fingerprint: ['a'.repeat(64)] }, { ...plan, fingerprint: 'A'.repeat(64) }, { ...plan, fingerprint: '0'.repeat(63) },
  { ...plan, action: 'restart' }, { ...plan, expected: 'Running' }, { ...plan, services: [] },
  { ...plan, services: Array(33).fill(entry('s', 'Stopped')) }, { ...plan, name: 'Different' }]) eq(parse(value), null)
for (const mutate of [
  p => { p.services[0].name = '' }, p => { p.services[0].name = 'x'.repeat(257) },
  p => { p.services[0].name = 'bad\nname' }, p => { p.services[0].displayName = 'x'.repeat(257) },
  p => { p.services[0].extra = 1 }, p => { p.services[0].state = 'StartPending' },
  p => { p.services[0].nextState = 'Stopped' }, p => { p.services[0].links = ['App'] },
  p => { p.services[0].links = ['Shared'] }, p => { p.services[1].links = ['Missing'] },
  p => { p.services[1].links = ['Shared', 'Shared'] }, p => { p.services[1].links = null },
  p => { p.services[1].name = 'SHARED' }, p => { p.services[2].links = ['Dependency']; p.services[1].links = [] },
  p => { p.services.reverse() }, p => { p.services[2].state = 'Running' },
]) { const p = copy(plan); mutate(p); eq(parse(p), null) }
eq(api.parseServicePlan(JSON.stringify(plan), 'Other', 'start'), null)
eq(api.parseServicePlan(JSON.stringify(plan), 'App', 'stop'), null)
eq(api.parseServicePlan(JSON.stringify(plan) + '\n{"limited":true}', 'App', 'start'), null)
eq(api.parseServicePlan(' '.repeat(65537), 'App', 'start'), null)
const progress = name => JSON.stringify({ progress: true, name, state: 'Running' })
const verified = JSON.stringify({ verified: true, name: 'App', action: 'start', fingerprint: plan.fingerprint })
const complete = [progress('Dependency'), progress('App'), verified].join('\n')
eq(api.serviceOutcome(complete, plan), { completed: ['Dependency', 'App'], verified: true })
eq(api.serviceOutcome(progress('Dependency'), plan), { completed: ['Dependency'], verified: false })
for (const output of ['', '{"verified":true}', verified, [progress('App'), progress('Dependency'), verified].join('\n'),
  complete + '\n' + verified, complete + '\n{"limited":true}', complete.replace('a'.repeat(64), 'b'.repeat(64)),
  complete.replace('Running', 'Stopped'), complete + '\nbad', complete.replace('"App"', '"Other"')]) eq(api.serviceOutcome(output, plan).verified, false)
const ref = value => ({ value })
function panel() {
  const hooks = [], calls = [], pendingCalls = []
  const task = { busy: ref(false), cancelling: ref(false), error: ref(''), result: ref(null), cancel: async () => { task.cancelling.value = true } }
  task.start = async (command, args) => {
    if (task.busy.value) throw Error('mock concurrent task')
    task.busy.value = true; task.result.value = null; task.error.value = ''; calls.push({ command, args })
    await new Promise(resolve => pendingCalls.push(resolve)); task.busy.value = false; task.cancelling.value = false
  }
  const source = read('src/tools/components/ServiceManagerTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
  const exports = {}
  new Function('exports', 'require', compile(source + '\nexport { read, preview, apply, dismiss, cancel, rows, listReady, limited, editing, accepted, pending, changing, notice };'))(
    exports, name => name === 'vue' ? { ref, computed: fn => ({ get value() { return fn() } }), onBeforeUnmount: fn => hooks.push(fn) }
      : name.includes('serviceDependencies') ? api : name.includes('systemManager') ? manager : { useNativeDiagnostic: () => task })
  const settle = (output, status = 'completed', exitCode = 0) => {
    task.result.value = { output, status, exitCode, elapsedMs: 1 }; pendingCalls.shift()()
  }
  return { ...exports, task, calls, settle, hooks }
}
const row = { name: 'App', value: '显示 App', state: 'Stopped', action: 'start', scope: '本机服务' }
const list = JSON.stringify(row)
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
async function prepared() {
  const p = panel(); const readOp = p.read(); p.settle(list); await readOp
  eq(p.listReady.value, true); p.editing.value = true
  const previewOp = p.preview(row)
  eq(p.calls.at(-1).args.request, { action: 'preview', name: 'App', expected: 'Stopped', confirmed: false })
  p.settle(JSON.stringify(plan)); await previewOp
  eq(p.pending.value, plan); eq(p.accepted.value, false)
  return p
}
async function lifecycle() {
  let p = panel(); await p.preview(row); await p.apply(); eq(p.calls.length, 0)
  p = await prepared(); await p.apply(); eq(p.calls.length, 2)
  p.accepted.value = true; let op = p.apply()
  eq(p.calls.length, 3); eq(p.calls[2].args.request, api.serviceApplyRequest(plan))
  eq(p.pending.value, null); eq(p.accepted.value, false)
  await p.apply(); await p.preview(row); await p.read(); eq(p.calls.length, 3)
  p.settle(complete); await flush(); eq(p.calls.length, 4); eq(p.calls[3].args.request.action, 'list')
  ok(p.notice.value.includes('最终状态已核验'))
  p.settle(list); await op; eq(p.changing.value, false); eq(p.pending.value, null); ok(p.notice.value.includes('已完成只读重查'))
  for (const [output, status, exit] of [[progress('Dependency'), 'completed', 1], [complete, 'cancelled', null],
    [complete, 'timeout', null], ['{"verified":true}', 'completed', 0], ['', 'completed', null]]) {
    p = await prepared(); p.accepted.value = true; op = p.apply(); p.settle(output, status, exit); await flush()
    eq(p.calls.length, 4); eq(p.calls[3].args.request.confirmed, false); ok(p.notice.value.includes('未完整核验'))
    p.settle(list); await op; eq(p.calls.filter(c => c.args.request.confirmed).length, 1)
  }
  for (const interrupt of ['dismiss', 'cancel', 'unmount', 'readonly']) {
    p = panel(); op = p.read(); p.settle(list); await op; p.editing.value = true; op = p.preview(row)
    if (interrupt === 'unmount') p.hooks.forEach(fn => fn())
    else if (interrupt === 'readonly') p.editing.value = false
    else p[interrupt]()
    p.settle(JSON.stringify(plan)); await op; eq(p.pending.value, null)
    if (interrupt !== 'unmount') ok(p.notice.value.includes('已放弃'))
    p.accepted.value = true; await p.apply(); eq(p.calls.length, 2)
  }
  for (const [output, status] of [[list + '\n{"limited":true}', 'completed'], [list, 'timeout'], [list, 'cancelled']]) {
    p = panel(); op = p.read(); p.settle(output, status); await op; p.editing.value = true
    await p.preview(row); eq(p.calls.length, 1); eq(p.listReady.value, false)
  }
  p = await prepared(); p.accepted.value = true; p.dismiss(); await p.apply(); eq(p.calls.length, 2)
  p = await prepared(); p.accepted.value = true; op = p.apply(); p.hooks.forEach(fn => fn()); p.settle(complete); await op
  eq(p.calls.length, 3); eq(p.rows.value, []); eq(p.notice.value, '')
  p = panel(); op = p.read(); p.hooks.forEach(fn => fn()); p.settle(list); await op; eq(p.rows.value, []); eq(p.listReady.value, false)
}
async function main() {
  await lifecycle()
  const ps = read('src-tauri/src/native_scripts/service_manager.ps1'), rust = read('src-tauri/src/service_manager.rs')
  for (const s of ['QueryServiceConfigW', 'needed > 8192', "s[0] == '+'", 'c.type != 16', 'ControlService(service, 1, out s)',
    'Open(name, 32)', 'OpenSCManagerW(null, null, 1)', 'CloseServiceHandle', 'Marshal.FreeHGlobal', '$visiting.Contains',
    '$visited.Count + $visiting.Count -ge 32', '$links.Sort([StringComparer]::Ordinal)',
    '$fingerprint -cne $request.fingerprint', '$plan.Count -ne $request.names.Count', '$plan[$i].name -cne $request.names[$i]',
    '(Plan-Hash (Get-Plan)) -cne (Plan-Hash $plan)', '$entry.state = $wanted', '$request.confirmed -ne $true',
    '$config.Start -eq 4', '$s.CanStop', '$clock.ElapsedMilliseconds -gt 15000', 'FromSeconds(3)', '$service.Dispose()', '$dep.Dispose()']) ok(ps.includes(s))
  const execution = ps.slice(ps.indexOf('foreach ($entry in $plan)'))
  ok(execution.indexOf('Assert-Plan') < execution.indexOf('$s.Start()'))
  ok(execution.indexOf('Assert-Plan', execution.indexOf('$entry.state = $wanted')) < execution.indexOf('progress = $true'))
  ok(ps.indexOf('Confirmed scope changed') < ps.indexOf('$s.Start()'))
  ok(!/\$\w+\.Stop\(|Stop-Service|Restart-Service|Invoke-Expression|Start-Process|RunAs|\-Force|ChangeServiceConfig/.test(ps))
  ok(Buffer.from(ps + ' '.repeat(1000), 'utf16le').toString('base64').length < 32000)
  for (const s of ['deny_unknown_fields', 'validate(&request)?', 'SYSTEM_CHANGE_LOCK.try_lock()', 'Duration::from_secs(20)',
    'request.fingerprint.len() == 64', 'request.names.len() <= 32', 'request.names.last() == Some(&request.name)',
    'unique.insert(n.to_lowercase())', 'request.confirmed && valid_name', 'request.expected == expected']) ok(rust.includes(s))
  const vue = read('src/tools/components/ServiceManagerTool.vue')
  for (const s of ['完整核验范围', 'service.state', 'service.nextState', '我已核对以上全部服务', '原子互斥', '隐式启动依赖', '部分实现']) ok(vue.includes(s))
  console.log(`${checks} service plan/parser, mocked confirmation/lifecycle and native-source assertions passed. Windows/PowerShell/C# NOT executed.`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
