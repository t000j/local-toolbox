// Safe source/mock checks only: no hosts, firewall, power, PowerShell or Rust execution.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = a => { assert.ok(a); checks++ }
const read = p => fs.readFileSync(p, 'utf8')
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(file) { const e = {}; new Function('exports', compile(read(file)))(e); return e }
const firewall = load('src/tools/firewallViewer.ts')
const rule = { name: 'id', displayName: 'Example', direction: 'Inbound', action: 'Allow', enabled: 'True', profile: 'Private', source: 'Local', detail: 'TCP 443', incomplete: false }
const parse = values => firewall.parseFirewallRows(values.map(v => JSON.stringify(v)).join('\n'))
eq(parse([rule]).rows, [rule]); eq(parse([rule, rule]).limited, true)
for (const value of [null, {}, [], { ...rule, name: '' }, { ...rule, name: 1 }, { ...rule, detail: 'x'.repeat(8193) }, { ...rule, incomplete: 'false' }]) {
  eq(parse([value]).rows.length, 0); eq(parse([value]).limited, true)
}
eq(parse([{ limited: true }]).limited, true); eq(parse([{ ...rule, incomplete: true }]).limited, true)
eq(firewall.parseFirewallRows('{partial').limited, true)
eq(parse(Array.from({ length: 1001 }, (_, i) => ({ ...rule, name: String(i) }))).rows.length, 1000)
eq(firewall.filterFirewall([rule], 'tcp 443', 'Inbound', 'True'), [rule])
for (const [q, d, e] of [['none', '', ''], ['', 'Outbound', ''], ['', '', 'False']]) eq(firewall.filterFirewall([rule], q, d, e), [])
const power = {}
let timer, runs = 0, ticks = []
new Function('exports', 'setInterval', 'clearInterval', compile(read('src/tools/powerActions.ts')))(power,
  fn => { timer = fn; return 1 }, () => { timer = undefined })
const countdown = power.createPowerCountdown(() => runs++, n => ticks.push(n))
countdown.start(); eq(ticks.at(-1), 10); countdown.start(); eq(ticks.length, 1)
for (let i = 0; i < 9; i++) timer()
eq(runs, 0); eq(ticks.at(-1), 1); countdown.cancel(); eq(timer, undefined); eq(runs, 0)
countdown.start(); for (let i = 0; i < 10; i++) timer()
eq(runs, 1); eq(timer, undefined); countdown.cancel(); eq(runs, 1)
eq(power.powerActions.map(a => a.id), ['lock', 'sleep', 'logoff', 'restart', 'shutdown'])
const refs = value => ({ value })
function setup(file, names, modules) {
  const e = {}, hooks = []
  const source = read(file).split('<script setup lang="ts">')[1].split('</script>')[0]
  new Function('exports', 'require', compile(source + '\nexport {' + names + '};'))(e,
    name => name === 'vue' ? { ref: refs, computed: fn => ({ get value() { return fn() } }), onBeforeUnmount: fn => hooks.push(fn) } : name.endsWith('/toolNavigation') ? { useToolLeaveGuard: () => {}, requestToolNavigation: action => action() } : modules(name))
  return { ...e, hooks }
}
async function lifecycle() {
  let calls = [], settle, fail
  const snapshot = { path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', content: '127.0.0.1 localhost', bom: false, backup: null }
  const p = setup('src/tools/components/HostsEditorTool.vue', 'run,snapshot,content,preview,accepted,editing,busy,error', () => ({
    trackedInvoke: (name, args) => { calls.push({ name, args }); return new Promise((resolve, reject) => { settle = resolve; fail = reject }) },
  }))
  await p.run(true); eq(calls.length, 0)
  let op = p.run(); eq(calls[0].args.request.action, 'read'); await p.run(); eq(calls.length, 1)
  settle(snapshot); await op; eq(p.snapshot.value, snapshot)
  p.content.value = '::1 localhost'; p.editing.value = true; p.preview.value = true
  await p.run(true); eq(calls.length, 1)
  p.accepted.value = true; op = p.run(true); eq(calls.length, 2); eq(calls[1].args.request.confirmed, true)
  eq(calls[1].args.request.expected, snapshot.content); eq(calls[1].args.request.content, '::1 localhost')
  await p.run(true); eq(calls.length, 2); fail('mock conflict'); await op
  eq(p.snapshot.value, null); eq(p.preview.value, false); eq(p.accepted.value, false)
  await p.run(true); eq(calls.length, 2)
  op = p.run(); p.hooks.forEach(fn => fn()); settle(snapshot); await op; eq(p.snapshot.value, null); eq(p.content.value, '')
  calls = []; let fire, cancelled = 0
  const task = { busy: refs(false), error: refs(''), result: refs(null), summary: refs(''), clear() {}, async start(command, args) { calls.push({ command, args }) } }
  const q = setup('src/tools/components/PowerActionsTool.vue', 'preview,confirm,cancel,execute,pending,accepted,queued', name => name.includes('powerActions') ? {
    powerActions: power.powerActions, createPowerCountdown: run => ({ start() { fire = run }, cancel() { cancelled++ } }),
  } : { useNativeDiagnostic: () => task })
  q.preview(power.powerActions[4]); q.confirm(); eq(q.queued.value, false)
  q.accepted.value = true; q.confirm(); eq(q.queued.value, true); eq(calls.length, 0)
  q.cancel(); fire(); await Promise.resolve(); eq(calls.length, 0)
  q.preview(power.powerActions[3]); q.accepted.value = true; q.confirm(); q.confirm(); fire(); await Promise.resolve()
  eq(calls.length, 1); eq(calls[0].args, { action: 'restart', confirmed: true }); fire(); eq(calls.length, 1)
  q.preview(power.powerActions[1]); q.accepted.value = true; q.confirm(); q.hooks.forEach(fn => fn()); fire(); eq(calls.length, 1); ok(cancelled >= 2)
}
async function main() {
  await lifecycle()
  const hosts = read('src-tauri/src/hosts_editor.rs'), powerRust = read('src-tauri/src/power_actions.rs')
  for (const s of ['GetWindowsDirectoryW', 'GetFileInformationByHandle', 'info.links != 1', 'file_attributes() & 0x400', 'share_mode(0)', 'create_new(true)', 'sync_all()', 'from_utf8', 'validate(&request.content)', 'encode(&request.expected, request.bom) != old', 'read_bytes(&mut file)? != bytes', 'deny_unknown_fields']) ok(hosts.includes(s))
  ok(hosts.indexOf('copy.write_all(&old)') < hosts.indexOf('file.write_all(&bytes)'))
  ok(hosts.indexOf('read_bytes(&mut copy)? != old') < hosts.indexOf('file.write_all(&bytes)'))
  ok(!hosts.includes('set_permissions')); ok(!hosts.includes('truncate(true)')); ok(!hosts.includes('remove_file'))
  for (const s of ['!confirmed', 'lease.cancelled()', 'SetSuspendState(0, 0, 0)', 'ExitWindowsEx(0, 0)', '"/t".into(), "0".into()', 'Duration::from_secs(15)', 'SYSTEM_CHANGE_LOCK.try_lock()']) ok(powerRust.includes(s))
  ok(!powerRust.includes('"/f".into()')); ok(!powerRust.includes('"/a".into()'))
  const ps = read('src-tauri/src/native_scripts/firewall_viewer.ps1')
  for (const s of ['Get-NetFirewallRule -PolicyStore ActiveStore', 'Select-Object -First 1001', 'Get-NetFirewallPortFilter', 'Get-NetFirewallAddressFilter', 'Get-NetFirewallApplicationFilter', 'Get-NetFirewallServiceFilter']) ok(ps.includes(s))
  ok(!/Set-NetFirewall|New-NetFirewall|Remove-NetFirewall|Enable-NetFirewall|Disable-NetFirewall|Start-Process|RunAs|Invoke-Expression/.test(ps))
  eq((read('src/tools/registry.ts').match(/id: '/g) || []).length, Number(fs.readFileSync('README.md', 'utf8').match(/当前源码已注册 (\d+) 款/)[1]))
  console.log(`${checks} parser, mock lifecycle/countdown and static safety assertions passed. Native Windows NOT run.`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
