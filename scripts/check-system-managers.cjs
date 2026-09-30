// Source-only checks. Does not run PowerShell, Rust, services or registry writes.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }
const ok = a => { assert.ok(a); checks++ }
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const parser = {}
new Function('exports', compile(fs.readFileSync('src/tools/systemManager.ts', 'utf8')))(parser)
const row = { name: 'Example', value: '旧值 %PATH% " ; $x', state: 'Stopped', action: 'start', scope: '本机服务' }
const parse = rows => parser.parseManagerRows(rows.map(r => JSON.stringify(r)).join('\n'))
eq(parse([row]).rows, [row])
eq(parse([row, row]).rows.length, 1)
eq(parse([row, row]).limited, true)
for (const invalid of [null, [], {}, { ...row, name: '' }, { ...row, name: 'x'.repeat(257) },
  { ...row, value: 'x'.repeat(8193) }, { ...row, action: 'execute' }, { ...row, scope: 1 },
  { ...row, kind: 'Binary' }, { ...row, state: 'x'.repeat(129) }]) {
  eq(parse([invalid]).rows.length, 0); eq(parse([invalid]).limited, true)
}
eq(parse([{ verified: true }]).limited, false)
eq(parse([{ limited: true }]).limited, true)
eq(parser.parseManagerRows('bad\n').limited, true)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: String(i) }))).rows.length, 500)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: String(i) }))).limited, true)
for (const action of ['start', 'stop', 'disable', 'restore', 'edit', '']) eq(parse([{ ...row, action }]).rows.length, 1)
function panel() {
  const refs = v => ({ value: v }), hooks = [], calls = [], pendingCalls = []
  const task = { busy: refs(false), cancelling: refs(false), error: refs(''), result: refs(null), cancel() {} }
  task.start = async (command, args) => {
    calls.push({ command, args }); task.busy.value = true
    await new Promise(resolve => pendingCalls.push(resolve)); task.busy.value = false
  }
  const source = fs.readFileSync('src/tools/components/SystemManagerPanel.vue', 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
  const exports = {}
  new Function('exports', 'require', 'defineProps', compile(source + '\nexport {read, preview, apply, editing, pending, accepted, newValue, notice, changing};'))(
    exports, name => name === 'vue' ? { ref: refs, computed: fn => ({ get value() { return fn() } }), onBeforeUnmount: fn => hooks.push(fn) }
      : name.includes('systemManager') ? parser : { useNativeDiagnostic: () => task },
    () => ({ command: 'run_service_manager', scope: '', warning: '', consequence: '' }))
  const response = output => ({ output, status: 'completed', exitCode: 0, elapsedMs: 1 })
  const settle = output => { task.result.value = response(output); pendingCalls.shift()() }
  task.result.value = response(JSON.stringify(row))
  return { ...exports, task, calls, settle, hooks }
}
async function testLifecycle() {
  let p = panel(); p.preview(row); await p.apply(); eq(p.calls.length, 0)
  p.editing.value = true; await p.apply(); eq(p.calls.length, 0)
  p.accepted.value = true; let operation = p.apply(); eq(p.calls.length, 1)
  eq(p.calls[0].args.request, { action: 'start', name: row.name, expected: 'Stopped', confirmed: true })
  await p.apply(); eq(p.calls.length, 1)
  p.settle('{"verified":true}'); await Promise.resolve(); await Promise.resolve()
  eq(p.calls.length, 2); eq(p.calls[1].args.request.action, 'list')
  p.settle(JSON.stringify(row)); await operation; eq(p.changing.value, false); eq(p.pending.value, null)
  ok(p.notice.value.includes('已核验'))
  p = panel(); p.editing.value = true; p.preview(row); p.accepted.value = true; operation = p.apply()
  p.settle(''); await Promise.resolve(); await Promise.resolve(); eq(p.calls.length, 2)
  eq(p.calls[1].args.request.confirmed, false); ok(p.notice.value.includes('未核验'))
  p.settle(JSON.stringify(row)); await operation
  p = panel(); p.editing.value = true; p.preview(row); p.accepted.value = true; operation = p.apply()
  p.hooks.forEach(fn => fn()); p.settle('{"verified":true}'); await operation
  eq(p.calls.length, 1); eq(p.newValue.value, ''); eq(p.pending.value, null)
  p = panel(); p.task.result.value.status = 'timeout'; p.editing.value = true; p.preview(row); p.accepted.value = true
  await p.apply(); eq(p.calls.length, 0)
  p = panel(); p.task.result.value.output += '\n{"limited":true}'; p.editing.value = true; p.preview(row); p.accepted.value = true
  await p.apply(); eq(p.calls.length, 0)
}
async function main() {
  await testLifecycle()
  for (const name of ['service', 'startup', 'environment']) {
    const rust = fs.readFileSync(`src-tauri/src/${name}_manager.rs`, 'utf8')
    const ps = fs.readFileSync(`src-tauri/src/native_scripts/${name}_manager.ps1`, 'utf8')
    ok(rust.includes('deny_unknown_fields')); ok(rust.includes('SYSTEM_CHANGE_LOCK.try_lock()'))
    ok(rust.includes('execute_script(')); ok(rust.includes('Duration::from_secs(20)'))
    ok(ps.includes('$request.confirmed -ne $true')); ok(!/Invoke-Expression|Start-Process|RunAs|Set-ExecutionPolicy|\-Force/.test(ps))
    ok(ps.includes('"verified":true') || ps.includes('verified = $true'))
  }
  const startup = fs.readFileSync('src-tauri/src/native_scripts/startup_manager.ps1', 'utf8')
  ok(startup.indexOf('$backup.SetValue') < startup.indexOf('$run.DeleteValue'))
  ok(startup.includes('Backup conflict; no overwrite')); ok(startup.includes('Restore conflict'))
  ok(!startup.includes('$backup.DeleteValue')); ok(startup.includes('DoNotExpandEnvironmentNames'))
  const env = fs.readFileSync('src-tauri/src/native_scripts/environment_manager.ps1', 'utf8')
  ok(env.includes('Sensitive-Name')); ok(env.includes('Protected-Name')); ok(env.includes('Missing existing variable'))
  ok(!env.includes('DeleteValue')); ok(!env.includes('CreateSubKey')); ok(!env.includes('SetEnvironmentVariable'))
  const registry = fs.readFileSync('src/tools/registry.ts', 'utf8')
  eq((registry.match(/id: '/g) || []).length, 69)
  console.log(`${checks} parser, mocked lifecycle and static safety assertions passed. Windows native tests NOT run.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
