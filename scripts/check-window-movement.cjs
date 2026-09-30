// Source and mock tests only. Never invoke Windows or move a real window.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = x => { assert.ok(x); checks++ }
const read = p => fs.readFileSync(p, 'utf8')
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const movement = {}
new Function('exports', compile(read('src/tools/windowMovement.ts')))(movement)
const item = { handle: 12, processId: 44, title: 'Example', processName: 'example', topMost: false,
  minimized: false, maximized: false, rect: { left: -100, top: 20, right: 200, bottom: 300 } }
eq(movement.canMove(item), true)
for (const bad of [NaN, Infinity, 1.2, '2', null, 100001, -100001]) eq(movement.validPosition(bad), false)
for (const good of [-100000, 0, 100000]) eq(movement.validPosition(good), true)
for (const patch of [{ rect: undefined }, { rect: null }, { minimized: true }, { maximized: true },
  { rect: {} }, { rect: { left: 1, right: 20 } }, { rect: { ...item.rect, top: '20' } },
  { rect: { ...item.rect, right: -100 } }]) eq(movement.canMove({ ...item, ...patch }), false)
for (const key of ['left', 'top', 'right', 'bottom']) {
  const incomplete = { ...item.rect }; delete incomplete[key]
  eq(movement.canMove({ ...item, rect: incomplete }), false)
}
eq(movement.moveRequest(item, 1, 2, false), null)
eq(movement.moveRequest(item, NaN, 2, true), null)
const request = movement.moveRequest(item, -5, 2, true)
eq(request.expected, item.rect); ok(request.expected !== item.rect); eq(request.x, -5)
const api = read('src-tauri/src/native_scripts/window_api.ps1')
// Exercise the exact pure C# geometry expression as JavaScript; no native API is executed.
const geometry = api.match(/public static bool HasVisibleTopStrip\(Rect target, Rect work\) \{([^}]+)\}/)
ok(geometry)
const hasVisibleTopStrip = new Function('target', 'work', geometry[1]
  .replace('int visibleWidth', 'const visibleWidth').replaceAll('Math.Min', 'Math.min').replaceAll('Math.Max', 'Math.max'))
const rect = (Left, Top, Right, Bottom) => ({ Left, Top, Right, Bottom })
const upper = rect(0, 0, 1920, 1040), lower = rect(0, 1080, 1920, 2120)
const safe = target => [upper, lower].some(work => hasVisibleTopStrip(target, work))
eq(safe(rect(100, 900, 900, 1600)), true) // Most window area on lower monitor; top strip on upper.
eq(hasVisibleTopStrip(rect(100, 900, 900, 1600), lower), false)
eq(safe(rect(100, 1080, 900, 1780)), true)
eq(safe(rect(100, 1010, 900, 1710)), false) // Strip crosses the upper work-area edge.
eq(safe(rect(100, 1050, 900, 1750)), false) // Top is in the gap/taskbar area.
eq(safe(rect(1856, 900, 2656, 1600)), true) // Exactly 64 pixels visible.
eq(safe(rect(1857, 900, 2657, 1600)), false)
eq(safe(rect(1900, 1020, 1920, 1040)), true) // Small window uses its actual dimensions.
eq(safe(rect(1901, 1020, 1921, 1040)), false)
eq(hasVisibleTopStrip(rect(-1900, -1000, -1100, -300), rect(-1920, -1080, 0, -40)), true)
async function main() {
  const e = {}, hooks = [], watches = [], calls = []
  let settle
  const task = { busy: { value: false }, error: { value: '' }, message: { value: '' }, async run(fn) {
    if (task.busy.value) return
    task.busy.value = true; task.error.value = ''
    try { return await fn() } catch (error) { task.error.value = String(error) } finally { task.busy.value = false }
  } }
  const source = read('src/tools/components/WindowControlTool.vue').split('<script setup lang="ts">')[1].split('</script>')[0]
  new Function('exports', 'require', compile(source + '\nexport { previewMove, confirmMove, cancelMove, pendingMove, accepted, x, y, items, refresh };'))(e,
    name => name === 'vue' ? { ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }),
      watch: (_, fn) => watches.push(fn), onMounted() {}, onBeforeUnmount: fn => hooks.push(fn) }
      : name.includes('windowMovement') ? movement : name.includes('nativeTools') ? { useNativeTask: () => task }
      : { trackedInvoke: (command, args) => { calls.push({ command, args }); return new Promise(resolve => { settle = resolve }) } })
  e.previewMove(item); eq(e.pendingMove.value.rect, item.rect); ok(e.pendingMove.value.rect !== item.rect)
  await e.confirmMove(); eq(calls.length, 0)
  e.accepted.value = true; e.x.value = 5; watches.forEach(fn => fn()); eq(e.accepted.value, false)
  e.accepted.value = true; const op = e.confirmMove(); eq(calls.length, 1); eq(e.pendingMove.value, null)
  eq(calls[0].command, 'move_desktop_window'); eq(calls[0].args.request.x, 5)
  await e.confirmMove(); eq(calls.length, 1)
  settle({ verified: true }); await new Promise(resolve => setImmediate(resolve)); eq(calls.length, 2)
  settle([item]); await op; eq(e.items.value, [item])
  e.previewMove(item); e.accepted.value = true; e.cancelMove(); await e.confirmMove(); eq(calls.length, 2)
  e.previewMove(item); e.accepted.value = true; hooks.forEach(fn => fn()); await e.confirmMove(); eq(calls.length, 2)
  eq(e.items.value, []); eq(e.pendingMove.value, null)
  const ps = read('src-tauri/src/native_scripts/window_move.ps1'), rust = read('src-tauri/src/native_windows.rs')
  for (const s of ['IsWindowVisible', 'IsIconic', 'IsZoomed', 'GetWindowThreadProcessId', '-cne $env:TOOLBOX_TITLE',
    '$old.Left -ne $expected.left', '$check.Left -ne $old.Left', 'foreach ($work in [ToolboxWindowApi]::MonitorWorkAreas())',
    '[ToolboxWindowApi]::HasVisibleTopStrip($target, $work)', 'if (-not $hasVisibleTop)',
    'SetWindowPos($window, [IntPtr]::Zero, $x, $y, 0, 0, 21)', '$after.Left -ne $x', 'verified=$true']) ok(ps.includes(s))
  ok(!/RunAs|Start-Process|ShowWindowAsync|PostMessage/.test(ps))
  ok(!ps.includes('MonitorFromRect'))
  for (const s of ['EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero) || areas.Count == 0',
    'if (!GetMonitorInfo(monitor, ref info)) return false;', 'areas.Add(info.Work);',
    'Marshal.SizeOf(typeof(MonitorInfo))',
    'if ([ToolboxWindowApi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) -eq [IntPtr]::Zero) {']) ok(api.includes(s))
  ok(/SetThreadDpiAwarenessContext\(\[IntPtr\]::new\(-4\)\) -eq \[IntPtr\]::Zero\) \{\s*throw /.test(api))
  for (const s of ['!request.confirmed', 'request.process_id == std::process::id()', 'deny_unknown_fields',
    '!(-100000..=100000).contains(v)', 'r.right <= r.left']) ok(rust.includes(s))
  ok(read('src-tauri/src/lib.rs').includes('native_windows::move_desktop_window'))
  console.log(`${checks} window movement parser/mock/source assertions passed. Native Windows NOT run.`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
