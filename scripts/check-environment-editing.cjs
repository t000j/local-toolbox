// Source + pure/mocked UI checks only. No PowerShell/Rust or actual registry operations.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = a => { assert.ok(a); checks++ }
const read = file => fs.readFileSync(file, 'utf8')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const env = {}
new Function('exports', compile(read('src/tools/environmentManager.ts')))(env)
const user = env.USER_ENVIRONMENT_SCOPE, system = env.SYSTEM_ENVIRONMENT_SCOPE
const row = { name: 'TOOLBOX_EXAMPLE', value: '旧值 %PATH% " ; $x', kind: 'ExpandString', scope: user, state: '可预览修改', action: 'edit' }
const terminal = { environmentSnapshot: true }
const encode = rows => [...rows, terminal].map(r => JSON.stringify(r)).join('\n')
const parse = rows => env.parseEnvironmentSnapshot(encode(rows))
const change = (action = 'edit', extra = {}) => ({ action, name: row.name, value: action === 'add' ? '' : row.value,
  newValue: action === 'delete' ? '' : '新值 %TEMP% ; $x', kind: row.kind, scope: user,
  expected: action === 'add' ? 'absent' : 'present', confirmed: false, ...extra })
const verify = c => JSON.stringify({ verified: true, action: c.action, name: c.name, scope: c.scope })
const valid = (c, rows = [row]) => env.environmentChangeError(rows, c) === ''
const p = parse([row]); eq(p.rows, [row]); eq(p.complete, true); eq(p.limited, false)
eq(parse([]), { rows: [], complete: true, limited: false })
eq(env.parseEnvironmentSnapshot('').complete, false)
eq(env.parseEnvironmentSnapshot(JSON.stringify(row)).complete, false)
eq(env.parseEnvironmentSnapshot(encode([row]) + '\n' + JSON.stringify(row)).limited, true)
eq(env.parseEnvironmentSnapshot(encode([row]) + '\n' + JSON.stringify(terminal)).limited, true)
for (const bad of [null, [], {}, '{bad', { ...row, name: '' }, { ...row, name: 'x'.repeat(257) }, { ...row, name: 'A=B' },
  { ...row, name: 'A\nB' }, { ...row, value: 'x'.repeat(8193) }, { ...row, value: 'a\0b' }, { ...row, value: '\ud800' },
  { ...row, kind: 'Binary' }, { ...row, action: 'delete' }, { ...row, state: 'different' }, { ...row, scope: 'HKCU other' },
  { environmentSnapshot: true, extra: true }, { verified: true }]) {
  eq(parse([bad]).limited, true); eq(parse([bad]).rows.length, 0)
}
eq(parse([row, { ...row, name: row.name.toLowerCase() }]).limited, true)
eq(parse([row, { ...row, scope: system, action: '', state: '只读' }]).rows.length, 2)
eq(parse([{ limited: true }]).limited, true)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: 'VAR_' + i }))).rows.length, 500)
eq(parse(Array.from({ length: 501 }, (_, i) => ({ ...row, name: 'VAR_' + i }))).limited, true)
for (const name of ['path', 'PATH', 'PaTh', 'PATHEXT', 'ComSpec', 'SystemRoot', 'windir', 'PSModulePath', 'PowerShell_Test',
  '__COMPAT_LAYER', 'HTTP_PROXY', 'NO_PROXY', 'NODE_OPTIONS', 'NPM_CONFIG_USERCONFIG', 'PYTHONPATH', 'JAVA_HOME', '_JAVA_OPTIONS',
  'JDK_JAVA_OPTIONS', 'DOTNET_STARTUP_HOOKS', 'CORECLR_ENABLE_PROFILING', 'COR_ENABLE_PROFILING', 'COMPLUS_Version',
  'OPENSSL_CONF', 'SSL_CERT_FILE', 'GIT_SSH', 'SSH_ASKPASS', 'GPG_AGENT_INFO', 'GNUPGHOME', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES',
  'BASH_ENV', 'ENV', 'RUBYOPT', 'PERL5OPT', 'LUA_INIT', 'R_PROFILE', 'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE', 'KUBECONFIG',
  'DOCKER_HOST', 'CARGO_HOME', 'RUSTC_WRAPPER', 'CL', 'LIBPATH', 'HOME', 'APPDATA', 'USERPROFILE', 'TEMP', 'TMP',
  'MY_PASSWORD', 'TOKEN', 'MY_SECRET', 'PRIVATE_KEY', 'API_KEY', 'ACCESS_KEY', 'AUTH', 'COOKIE', 'CREDENTIAL',
  '', '1VAR', '变量', 'A B', 'A=B', 'A-B', 'A.B', 'A\nB', 'APP_THEME\n', 'APP_THEME\r', 'A'.repeat(257)]) {
  eq(env.editableEnvironmentName(name), false)
  eq(valid(change('add', { name }), []), false)
}
for (const name of ['TOOLBOX_EXAMPLE', '_MY_DATA', 'APP_THEME', 'A'.repeat(256)]) eq(env.editableEnvironmentName(name), true)
const hidden = { ...row, name: 'MY_SECRET', value: env.HIDDEN_ENVIRONMENT_VALUE, state: '内容已隐藏', action: '' }
eq(parse([hidden]).rows, [hidden]); eq(parse([{ ...hidden, value: 'must not be shown' }]).rows.length, 0)
eq(parse([{ ...row, name: 'PATH' }]).limited, true)
eq(parse([{ ...row, name: '变量', state: '只读', action: '' }]).rows.length, 1)
for (const c of [change(), change('delete'), change('edit', { newValue: '' })]) ok(valid(c))
for (const c of [change('add'), change('add', { newValue: '' }), change('add', { kind: 'String', newValue: ' \n ' })]) ok(valid(c, []))
ok(!valid(change('add'))); ok(!valid(change('add', { name: row.name.toLowerCase() })))
for (const c of [change('rename'), change('edit', { scope: system }), change('edit', { value: 'stale' }),
  change('edit', { kind: 'String' }), change('edit', { name: row.name.toLowerCase() }), change('edit', { expected: 'absent' }),
  change('edit', { newValue: row.value }), change('delete', { newValue: 'unexpected' }), change('delete', { value: 'stale' }),
  change('edit', { kind: 'DWord' }), change('edit', { newValue: 'x'.repeat(8193) }), change('edit', { newValue: 'x\0y' })]) ok(!valid(c))
ok(!valid(change('edit'), [])); ok(!valid(change('delete'), []))
ok(!valid(change('add', { expected: 'present' }), [])); ok(!valid(change('add', { value: 'old' }), []))
ok(env.validEnvironmentValue('😀'.repeat(4096))); ok(!env.validEnvironmentValue('😀'.repeat(4097)))
for (const value of ['\ud800', '\udfff', 'a\ud800b', 'a\udfffb']) ok(!env.validEnvironmentValue(value))
for (const value of ['', 'raw %PATH% ; $(whoami)', '\n\t ', '😀']) ok(env.validEnvironmentValue(value))
for (const action of ['add', 'edit', 'delete']) {
  const c = change(action); ok(env.environmentChangeVerified(verify(c), c))
  for (const output of ['', '{}', '{"verified":true}', verify({ ...c, name: 'OTHER' }), verify({ ...c, scope: system }),
    verify({ ...c, action: 'list' }), verify(c) + '\n{"limited":true}', verify(c) + '\n' + verify(c)]) eq(env.environmentChangeVerified(output, c), false)
}
function panel() {
  const refs = value => ({ value }), hooks = [], calls = [], pendingCalls = []
  const task = { busy: refs(false), cancelling: refs(false), error: refs(''), result: refs(null), cancel() {} }
  task.start = async (command, args) => {
    calls.push({ command, args }); task.busy.value = true; task.result.value = null; task.error.value = ''
    await new Promise(resolve => pendingCalls.push(resolve)); task.busy.value = false
  }
  const source = read('src/tools/components/EnvironmentManagerTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
  const exports = {}
  new Function('exports', 'require', compile(source + '\nexport {read, begin, preview, previewDelete, invalidatePreview, closeEditor, apply, editing, pending, editor, draftName, draftValue, draftKind, accepted, notice, changing, validation, ready};'))(
    exports, name => name === 'vue' ? { ref: refs, computed: fn => ({ get value() { return fn() } }), onBeforeUnmount: fn => hooks.push(fn) }
      : name.includes('environmentManager') ? env : { useNativeDiagnostic: () => task })
  const response = (output, extras = {}) => ({ output, status: 'completed', exitCode: 0, elapsedMs: 1, ...extras })
  const settle = (output, extras) => { task.result.value = response(output, extras); pendingCalls.shift()() }
  task.result.value = response(encode([row]))
  return { ...exports, task, calls, settle, hooks, response }
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
async function lifecycle() {
  let p = panel(); p.begin('add'); eq(p.editor.value, null); p.previewDelete(row); eq(p.pending.value, null)
  p.editing.value = true; p.begin('edit', row); p.draftValue.value = 'new'; p.preview(); await p.apply(); eq(p.calls.length, 0)
  p.accepted.value = true; let op = p.apply(); eq(p.calls.length, 1); const first = p.calls[0].args.request
  eq(first, change('edit', { newValue: 'new', confirmed: true })); eq(p.pending.value, null); eq(p.draftValue.value, '')
  await p.apply(); eq(p.calls.length, 1); await p.read(); eq(p.calls.length, 1)
  p.settle(verify(first)); await tick(); eq(p.calls.length, 2); eq(p.calls[1].args.request.action, 'list')
  p.settle(encode([{ ...row, value: 'new' }])); await op; eq(p.changing.value, false); ok(p.notice.value.includes('已核验'))
  await p.apply(); eq(p.calls.length, 2)
  // Add uses the complete unfiltered snapshot, an absent precondition and a frozen preview.
  p = panel(); p.editing.value = true; p.begin('add'); p.draftName.value = 'APP_THEME'; p.draftValue.value = ''; p.preview()
  eq(p.pending.value, change('add', { name: 'APP_THEME', kind: 'String', newValue: '' }))
  p.accepted.value = true; op = p.apply(); const add = p.calls[0].args.request; eq(add.expected, 'absent'); eq(add.newValue, '')
  p.settle(verify(add)); await tick(); p.settle(encode([row])); await op
  // Delete preserves old raw value and kind and never writes a replacement value.
  p = panel(); p.editing.value = true; p.previewDelete(row); eq(p.pending.value, change('delete'))
  p.accepted.value = true; op = p.apply(); const del = p.calls[0].args.request; eq(del.action, 'delete'); eq(del.value, row.value)
  p.settle(verify(del)); await tick(); p.settle(encode([])); await op; eq(p.ready.value, true)
  // Failure, cancellation, truncation and wrong-target verification trigger only a read, never retry.
  for (const [output, result] of [['', { status: 'cancelled' }], ['', { status: 'timeout' }], ['', { status: 'outputLimit' }],
    ['', { exitCode: 1 }], ['{"verified":true}', {}], [verify(change('edit', { name: 'OTHER' })), {}]]) {
    p = panel(); p.editing.value = true; p.previewDelete(row); p.accepted.value = true; op = p.apply()
    p.settle(output, result); await tick(); eq(p.calls.length, 2); eq(p.calls[1].args.request.confirmed, false)
    ok(p.notice.value.includes('未核验')); p.settle(encode([row])); await op; eq(p.calls.length, 2)
  }
  // Input events, dismissal and refresh revoke confirmation.
  p = panel(); p.editing.value = true; p.begin('edit', row); p.draftValue.value = 'new'; p.preview(); p.accepted.value = true
  p.invalidatePreview(); eq(p.pending.value, null); eq(p.accepted.value, false); await p.apply(); eq(p.calls.length, 0)
  p.preview(); p.accepted.value = true; p.closeEditor(); await p.apply(); eq(p.calls.length, 0); eq(p.draftName.value, '')
  p.previewDelete(row); p.accepted.value = true; op = p.read(); eq(p.pending.value, null); eq(p.accepted.value, false)
  p.settle(encode([row])); await op
  // Changed snapshots are revalidated at apply time.
  p = panel(); p.editing.value = true; p.previewDelete(row); p.accepted.value = true
  p.task.result.value = p.response(encode([{ ...row, value: 'external change' }])); await p.apply(); eq(p.calls.length, 0); ok(p.validation.value)
  for (const output of ['', JSON.stringify(row), encode([row, { limited: true }]), encode([row, row])]) {
    p = panel(); p.editing.value = true; p.task.result.value = p.response(output); p.begin('add'); p.previewDelete(row)
    eq(p.editor.value, null); eq(p.pending.value, null)
  }
  for (const extras of [{ status: 'timeout' }, { status: 'cancelled' }, { status: 'outputLimit' }, { exitCode: 1 }]) {
    p = panel(); p.editing.value = true; p.task.result.value = p.response(encode([row]), extras); p.begin('add'); eq(p.editor.value, null)
  }
  // Unmount clears pending values and prevents completion from starting another read.
  p = panel(); p.editing.value = true; p.previewDelete(row); p.accepted.value = true; op = p.apply()
  p.hooks.forEach(fn => fn()); p.settle(verify(change('delete'))); await op
  eq(p.calls.length, 1); eq(p.pending.value, null); eq(p.draftValue.value, ''); eq(p.notice.value, '')
  await p.read(); p.begin('add'); eq(p.calls.length, 1); eq(p.editor.value, null)
  p = panel(); p.editing.value = true; p.begin('add'); p.draftName.value = row.name.toLowerCase(); p.preview(); eq(p.pending.value, null); ok(p.validation.value)
}
async function main() {
  await lifecycle()
  const ps = read('src-tauri/src/native_scripts/environment_manager.ps1'), rust = read('src-tauri/src/environment_manager.rs')
  const helper = read('src/tools/environmentManager.ts'), ui = read('src/tools/components/EnvironmentManagerTool.vue')
  // Verify the exact native/TS policy patterns stay aligned (does not execute PowerShell).
  for (const [psName, tsName] of [['Sensitive', 'sensitiveName'], ['Protected', 'protectedName']]) {
    const native = ps.match(new RegExp(`function ${psName}-Name[^\\n]+?-match '\\(\\?i\\)([^']+)'`))[1]
    const frontend = helper.match(new RegExp(`const ${tsName} = /(.+)/i`))[1]
    eq(native, frontend)
  }
  for (const fragment of ['deny_unknown_fields', 'SYSTEM_CHANGE_LOCK.try_lock()', 'Duration::from_secs(20)',
    'validate(&request)?', 'value.encode_utf16().count() <= 8192', 'request.scope == "用户 HKCU Environment"',
    '"add" => request.expected == "absent"', '"delete" => request.expected == "present"', '"scope":request.scope,"expected":request.expected']) ok(rust.includes(fragment))
  for (const fragment of ["$request.confirmed -ne $true", "!(Editable-Name $request.name)", "Add conflict; no overwrite", 'Missing existing variable',
    '$old -cne $request.value', '$kind -cne $request.kind', '$userKey.DeleteValue($request.name, $true)',
    "$userRoot.CreateSubKey('Environment', $true)", '$userKey.Flush()', '$existsAfter', '$actual -cne $request.newValue',
    'DoNotExpandEnvironmentNames', 'environmentSnapshot', 'action = $request.action; name = $request.name; scope = $request.scope']) ok(ps.includes(fragment))
  ok(ps.indexOf('!(Editable-Name $request.name)') < ps.indexOf('$userKey.GetValue('))
  ok(ps.indexOf('$old -cne $request.value') < ps.indexOf('$userKey.DeleteValue('))
  ok(ps.indexOf('$existsAfter') < ps.indexOf('verified = $true'))
  ok(ps.includes("$systemRoot.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', $false)"))
  ok(!/Invoke-Expression|Start-Process|RunAs|Set-ExecutionPolicy|SetEnvironmentVariable|SendMessage|SetAccessControl|DeleteSubKey|\-Force/.test(ps))
  ok(!/localStorage|sessionStorage|navigator.clipboard|v-html|console\./.test(ui + helper))
  for (const fragment of ['@input="invalidatePreview"', '@change="invalidatePreview"', '@change="closeEditor"',
    '生成变更预览', '确认执行一次', '系统变量', '不自动备份或回滚', '原子互斥', '空字符串不是删除']) ok(ui.includes(fragment))
  console.log(`${checks} environment parser, preview/lifecycle and source-safety assertions passed. Windows native/registry tests NOT run.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
