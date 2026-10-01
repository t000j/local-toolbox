// Pure parsers, mocked Vue lifecycle, state models, and source checks only. No actual startup/system IO.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = a => { assert.ok(a); checks++ }
const read = p => fs.readFileSync(p, 'utf8')
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const api = {}; new Function('exports', compile(read('src/tools/startupManager.ts')))(api)
const row = { source: 'hkcu-run-64', name: '示例 " app', value: '"C:\\App.exe" %PATH% ; $x', kind: 'ExpandString', backup: false, state: 'registered', action: 'disable', token: '' }
const folder = { ...row, source: 'user-folder', name: 'Example.lnk', value: 'C:\\Users\\Example\\Programs\\Startup\\Example.lnk', kind: 'File', token: 'a'.repeat(64) }
const end = source => ({ startupSnapshot: true, source })
const output = (rows, source = row.source) => [...rows, end(source)].map(r => JSON.stringify(r)).join('\n')
const parse = (rows, source = row.source) => api.parseStartupSnapshot(output(rows, source), source)
const verified = r => JSON.stringify({ verified: true, action: r.action, source: r.source, name: r.name })
eq(api.STARTUP_SOURCES.length, 10)
for (const spec of api.STARTUP_SOURCES) {
  const r = spec.id.endsWith('-folder') ? { ...folder, source: spec.id } : { ...row, source: spec.id }
  if (!spec.writable) Object.assign(r, { state: 'readonly', action: '' })
  eq(parse([r], spec.id), { rows: [r], complete: true, limited: false })
}
eq(parse([]), { rows: [], complete: true, limited: false })
eq(api.parseStartupSnapshot('', row.source).complete, false)
eq(api.parseStartupSnapshot(JSON.stringify(row), row.source).complete, false)
eq(api.parseStartupSnapshot(output([row]) + '\n' + JSON.stringify(row), row.source).limited, true)
const restored = { ...row, backup: true, state: 'recoverable', action: 'restore' }
for (const r of [restored, { ...row, state: 'conflict', action: '' }, { ...restored, state: 'conflict', action: '' }]) eq(parse([r]).rows, [r])
for (const bad of [null, [], {}, { ...row, unexpected: true }, { ...row, name: '' }, { ...row, name: 'x'.repeat(257) },
  { ...row, name: 'A\nB' }, { ...row, name: '\u0085' }, { ...row, name: '\ud800' }, { ...row, value: 'x'.repeat(8193) },
  { ...row, value: 'a\0b' }, { ...row, value: '\ud800' }, { ...row, kind: 'DWord' }, { ...row, kind: 'File' },
  { ...row, token: 'a' }, { ...row, source: 'hklm-run-64' }, { ...row, backup: 'false' }, { ...row, state: 'enabled' },
  { ...row, action: 'execute' }, { ...row, state: 'registered', backup: true }, { ...row, state: 'recoverable' },
  { ...row, state: 'readonly', action: '' }, { ...restored, backup: false }, { ...restored, action: 'disable' },
  { startupSnapshot: true, source: row.source, extra: true }, { verified: true }]) {
  eq(parse([bad]).limited, true); eq(parse([bad]).rows.length, 0)
}
for (const r of [row, restored]) eq(parse([r, { ...r, name: r.name.toUpperCase() }]).limited, true)
eq(parse([row, { ...restored, state: 'conflict', action: '' }]).rows.length, 2)
eq(parse([{ limited: true }]).limited, true)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: 'APP' + i }))).rows.length, 500)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: 'APP' + i }))).limited, true)
for (const source of ['hkcu-runonce-32', 'hkcu-runonce-64', 'hklm-runonce-32', 'hklm-runonce-64']) {
  for (const bad of [{ ...row, source }, { ...restored, source }, { ...row, source, state: 'conflict', action: '' }]) eq(parse([bad], source).limited, true)
}
for (const name of ['', '.', '..', '../A', 'A\\B', 'A:B', 'A?B', 'A*B', 'A|B', 'A<B', 'A>B', 'A"B', 'A ', 'A.', 'CON',
  'con.lnk', 'NUL.exe', 'COM1.txt', 'LPT³.foo', 'A\nB', 'x'.repeat(256)]) {
  eq(api.validStartupName(name, true), false); eq(parse([{ ...folder, name }], folder.source).limited, true)
}
for (const name of ['普通.lnk', '😀.lnk', 'two words.lnk', '.hidden', 'x'.repeat(255)]) eq(api.validStartupName(name, true), true)
for (const bad of [{ ...folder, token: '' }, { ...folder, token: 'z'.repeat(64) }, { ...folder, kind: 'String' }, { ...folder, value: 'x'.repeat(4097) }, { ...folder, value: '' }, { ...folder, value: '\\\\server\\Startup\\Example.lnk' }, { ...folder, value: 'C:\\Startup\\other.lnk' }, { ...folder, value: 'C:\\Startup\\..\\Example.lnk' }]) eq(parse([bad], folder.source).limited, true)
eq(parse([{ ...row, value: '😀'.repeat(4096) }]).limited, false)
eq(parse([{ ...row, value: '😀'.repeat(4097) }]).limited, true)
for (const r of [row, restored, folder, { ...folder, source: 'common-folder', backup: true, state: 'recoverable', action: 'restore' }]) {
  eq(api.startupChangeRequest(r), { action: r.action, source: r.source, name: r.name, value: r.value, kind: r.kind, expected: r.state, backup: r.backup, token: r.token, confirmed: true })
  ok(api.startupChangeVerified(verified(r), r))
  for (const s of ['', '{}', '{"verified":true}', verified({ ...r, source: 'wrong' }), verified({ ...r, name: 'wrong' }), verified({ ...r, action: 'list' }), verified(r) + '\n{}', verified(r) + '\n' + verified(r)]) eq(api.startupChangeVerified(s, r), false)
}
function panel(r = row) {
  const refs = value => ({ value }), hooks = [], calls = [], queue = []
  const task = { busy: refs(false), cancelling: refs(false), error: refs(''), result: refs(null), cancel() {}, clear() { task.result.value = null } }
  task.start = async (command, args) => { calls.push({ command, args }); task.busy.value = true; task.result.value = null; await new Promise(resolve => queue.push(resolve)); task.busy.value = false }
  const source = read('src/tools/components/StartupManagerTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
  const ui = {}; new Function('exports', 'require', compile(source + '\nexport {read, preview, apply, resetSource, closePreview, pending, source, editing, accepted, changing, notice, snapshot, ready};'))(ui,
    name => name === 'vue' ? { ref: refs, computed: f => ({ get value() { return f() } }), onBeforeUnmount: f => hooks.push(f) }
      : name.includes('startupManager') ? api : { useNativeDiagnostic: () => task })
  const response = (out, extra = {}) => ({ output: out, status: 'completed', exitCode: 0, elapsedMs: 1, ...extra })
  const settle = (out, extra) => { task.result.value = response(out, extra); queue.shift()() }
  task.result.value = response(output([r], r.source)); ui.source.value = r.source
  return { ...ui, task, calls, settle, hooks, response, select: () => ui.preview(ui.snapshot.value.rows[0]) }
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
async function lifecycle() {
  let p = panel(); p.select(); eq(p.pending.value, null); p.editing.value = true; p.select(); await p.apply(); eq(p.calls.length, 0)
  p.accepted.value = true; let op = p.apply(); eq(p.calls.length, 1); eq(p.calls[0].args.request, api.startupChangeRequest(row)); eq(p.pending.value, null); eq(p.accepted.value, false)
  await p.apply(); await p.read(); eq(p.calls.length, 1)
  p.settle(verified(row)); await tick(); eq(p.calls.length, 2); eq(p.calls[1].args.request.action, 'list'); eq(p.calls[1].args.request.confirmed, false)
  p.settle(output([restored])); await op; eq(p.changing.value, false); ok(p.notice.value.includes('已核验'))
  for (const extra of [{ status: 'cancelled' }, { status: 'timeout' }, { status: 'outputLimit' }, { exitCode: 1 }]) {
    p = panel(); p.editing.value = true; p.select(); p.accepted.value = true; op = p.apply(); p.settle(verified(row), extra)
    await tick(); eq(p.calls.length, 2); eq(p.calls[1].args.request.action, 'list'); ok(p.notice.value.includes('未核验')); p.settle(output([])); await op
  }
  p = panel(); p.editing.value = true; p.select(); p.accepted.value = true; op = p.apply(); p.hooks.forEach(f => f()); p.settle(verified(row)); await op
  eq(p.calls.length, 1); eq(p.notice.value, ''); eq(p.pending.value, null)
  for (const out of [JSON.stringify(row), output([row, { limited: true }]), output([row]) + '\n{}', output([row], 'hklm-run-64')]) {
    p = panel(); p.task.result.value.output = out; p.editing.value = true; p.select(); p.accepted.value = true; await p.apply(); eq(p.calls.length, 0)
  }
  p = panel(); p.editing.value = true; p.select(); p.accepted.value = true; p.closePreview(); await p.apply(); eq(p.calls.length, 0)
  p = panel(); p.editing.value = true; p.select(); p.accepted.value = true; p.source.value = 'hklm-run-64'; p.resetSource(); await p.apply(); eq(p.calls.length, 0); eq(p.editing.value, false); eq(p.ready.value, false)
  p = panel(); p.editing.value = true; p.select(); p.accepted.value = true; p.task.result.value.output = output([{ ...row, value: 'changed' }]); await p.apply(); eq(p.calls.length, 0)
  for (const r of [folder, { ...folder, source: 'common-folder', state: 'recoverable', action: 'restore', backup: true }]) {
    p = panel(r); p.editing.value = true; p.select(); p.accepted.value = true; op = p.apply(); eq(p.calls[0].args.request, api.startupChangeRequest(r)); p.settle(verified(r)); await tick(); p.settle(output([], r.source)); await op
  }
}
// Abstract no-overwrite/backup state model: this is not execution of the native APIs.
function renameModel(from, to, name, token) {
  if (!from.has(name) || from.get(name).token !== token || to.has(name)) return false
  const entry = from.get(name); to.set(name, entry); from.delete(name); return true
}
const a = new Map([['app.lnk', { token: 'old', bytes: [0, 1, 255], acl: 'preserved' }]]), b = new Map()
const original = a.get('app.lnk'); eq(renameModel(a, b, 'app.lnk', 'stale'), false); eq(renameModel(a, b, 'app.lnk', 'old'), true)
eq(b.get('app.lnk'), original); eq(a.has('app.lnk'), false)
a.set('app.lnk', { token: 'new' }); eq(renameModel(b, a, 'app.lnk', 'old'), false); eq(b.get('app.lnk'), original)
a.delete('app.lnk'); eq(renameModel(b, a, 'app.lnk', 'old'), true); eq(a.get('app.lnk'), original); eq(b.has('app.lnk'), false)
async function main() {
  await lifecycle()
  const rust = read('src-tauri/src/startup_manager.rs'), registry = read('src-tauri/src/native_scripts/startup_manager.ps1'), files = read('src-tauri/src/native_scripts/startup_folders.ps1'), ui = read('src/tools/components/StartupManagerTool.vue')
  for (const s of ['deny_unknown_fields', 'SYSTEM_CHANGE_LOCK.try_lock()', 'Duration::from_secs(20)', 'valid_component', 'validate(&request)?']) ok(rust.includes(s))
  for (const s of ['Registry64', 'Registry32', 'CurrentUser', 'LocalMachine', 'RunOnce', 'DoNotExpandEnvironmentNames', 'Backup conflict; no overwrite', 'Restore conflict', 'Is64BitOperatingSystem']) ok(registry.includes(s))
  ok(registry.indexOf('$backup.SetValue') < registry.indexOf('$run.DeleteValue')); ok(!registry.includes('$backup.DeleteValue'))
  ok(registry.includes("$keyName -ne 'run'")); ok(registry.includes('$request.confirmed -ne $true'))
  for (const s of ['SpecialFolder.Startup', 'SpecialFolder.CommonStartup', 'DoNotVerify', 'i.links==1', 'GetDriveType(drive)==3', 'attrs=0x1000', '0x600020U', 'CheckMarker(false)', 'CheckMarker(true)', 'NtSetInformationFile', 'Token(from,file)==q.token']) ok(files.includes(s))
  ok(files.includes('saved=Open(parent,BackupName,true,0,2,false)')) // FILE_CREATE, never OPEN_IF or overwrite
  ok(files.includes('for(int k=0;k<nameAt;k++) Marshal.WriteByte(p,k,0)')) // ReplaceIfExists stays false
  ok(files.includes('if(optional&&(status==')); ok(files.includes('Identity(before)==Identity(after)'))
  ok(!/File\.Move|File\.Copy|DeleteFile|ShellExecute|WScript\.Shell|\.Resolve\(/.test(files))
  for (const script of [registry, files]) {
    ok(!/Invoke-Expression|Start-Process|RunAs|Set-ExecutionPolicy|\-Force|Set-Acl/.test(script))
    const compact = script.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#') && !s.startsWith('//')).join('\n')
    ok((compact.length + 700) * 8 / 3 + 300 < 32767)
  }
  for (const s of ['partial', 'StartupApproved', '计划任务']) if (s !== 'partial') ok(ui.includes(s))
  ok(!/v-html|localStorage|sessionStorage|clipboard|SystemManagerPanel/.test(ui))
  console.log(`${checks} startup parser, mocked lifecycle, abstract conflict model and source assertions passed. Windows native behavior NOT run.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
