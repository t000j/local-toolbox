// No Rust/Windows/image codec execution: mocks and source contracts only.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = v => { assert.ok(v); checks++ }
const read = p => fs.readFileSync(p, 'utf8')
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function fixture(component) {
  const hooks = [], calls = [], pending = []
  const vue = { ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }), onBeforeUnmount: fn => hooks.push(fn) }
  const invoke = (command, args) => {
    calls.push({ command, args })
    if (command === 'cancel_network_probe' || command === 'run_dns_query') return Promise.resolve()
    return new Promise((resolve, reject) => pending.push({ command, resolve, reject }))
  }
  const taskExports = {}
  new Function('exports', 'require', compile(read('src/tools/useNativeImageTask.ts')))(taskExports,
    name => name === 'vue' ? vue : { trackedInvoke: invoke })
  const e = {}
  let source = read(`src/tools/components/${component}.vue`).split('<script setup lang="ts">')[1].split('</script>')[0]
  const names = component === 'ImageFormatConverterTool' ? 'convertAndSave,outputInfo' : 'createPreview,saveCompressed,preview'
  source += `\nexport { selectImage, inputPath, inputInfo, outputFormat, jpegQuality, loading, error, success, task, cancel, ${names} };`
  new Function('exports', 'require', compile(source))(e, name => name === 'vue' ? vue : name.includes('useNativeImageTask') ? taskExports
    : name.includes('plugin-dialog') ? { open: () => invoke('open'), save: args => invoke('save', args) } : {})
  return { e, hooks, calls, pending }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const image = { width: 10, height: 5, sizeBytes: 20, format: 'PNG', previewDataUrl: 'data:image/png;base64,AA==', sourceHash: 'a'.repeat(64) }
async function choose(f) {
  const promise = f.e.selectImage(); eq(f.e.loading.value, true)
  await f.e.selectImage(); eq(f.calls.filter(c => c.command === 'open').length, 1)
  f.pending.shift().resolve('C:\\fixture\\input.png'); await tick()
  eq(f.pending[0].command, 'prepare_network_probe'); f.pending.shift().resolve('lease1'); await tick()
  eq(f.pending[0].command, 'inspect_image_file'); f.pending.shift().resolve(image); await promise
  eq(f.e.inputInfo.value, image); eq(f.e.loading.value, false)
}
async function main() {
  for (const component of ['ImageFormatConverterTool', 'ImageCompressionTool']) {
    let f = fixture(component); await choose(f)
    if (component === 'ImageFormatConverterTool') {
      f.e.outputFormat.value = 'jpeg'; f.e.jpegQuality.value = 90
      const promise = f.e.convertAndSave(); await f.e.convertAndSave()
      eq(f.calls.filter(c => c.command === 'save').length, 1)
      f.e.outputFormat.value = 'png'; f.e.jpegQuality.value = 50
      f.pending.shift().resolve('C:\\fixture\\out.jpg'); await tick(); f.pending.shift().resolve('lease2'); await tick()
      const call = f.calls.at(-1)
      eq(call.command, 'convert_image_file'); eq(call.args.expectedHash, image.sourceHash)
      eq(call.args.format, 'jpeg'); eq(call.args.jpegQuality, 90)
      f.pending.shift().resolve({ ...image, format: 'JPG' }); await promise
      eq(f.e.outputInfo.value.format, 'JPG'); eq(f.calls.filter(c => c.command === 'inspect_image_file').length, 1)
    } else {
      const previewPromise = f.e.createPreview(); await f.e.createPreview()
      f.pending.shift().resolve('lease2'); await tick()
      eq(f.calls.at(-1).args.expectedHash, image.sourceHash)
      const preview = { ...image, inputSizeBytes: 20, outputSizeBytes: 10, reductionPercent: 50, outputHash: 'b'.repeat(64) }
      f.pending.shift().resolve(preview); await previewPromise
      const promise = f.e.saveCompressed(); await f.e.saveCompressed(); eq(f.calls.filter(c => c.command === 'save').length, 1)
      f.pending.shift().resolve('C:\\fixture\\out.png'); await tick(); f.pending.shift().resolve('lease3'); await tick()
      eq(f.calls.at(-1).args.expectedHash, image.sourceHash); eq(f.calls.at(-1).args.expectedOutputHash, preview.outputHash)
      f.pending.shift().resolve({ outputSizeBytes: 10 }); await promise; ok(f.e.success.value.includes('回读核验'))
    }
    // Cancel a pending file selection, then late dialog result must not start a native command.
    f = fixture(component); const selection = f.e.selectImage(); await f.e.cancel()
    f.pending.shift().resolve('C:\\fixture\\late.png'); await selection
    eq(f.calls.filter(c => c.command === 'prepare_network_probe').length, 0); eq(f.e.inputInfo.value, null)
    // Unmount during preparation consumes only the cancelled reservation with an invalid read-only request.
    f = fixture(component); const stale = f.e.selectImage(); f.pending.shift().resolve('C:\\fixture\\late.png'); await tick()
    f.hooks.forEach(fn => fn()); f.pending.shift().resolve('cancelled-lease'); await stale
    eq(f.calls.filter(c => c.command === 'inspect_image_file').length, 0)
    eq(f.calls.at(-1).command, 'run_dns_query'); eq(f.e.inputPath.value, ''); eq(f.e.inputInfo.value, null)
    // An in-flight native result cannot revive unmounted state.
    f = fixture(component); const late = f.e.selectImage(); f.pending.shift().resolve('C:\\fixture\\late.png'); await tick()
    f.pending.shift().resolve('running-lease'); await tick(); f.hooks.forEach(fn => fn())
    f.pending.shift().resolve(image); await late; eq(f.e.inputInfo.value, null); eq(f.e.inputPath.value, '')
    // Save dialog cancellation/unmount must not write.
    f = fixture(component); await choose(f)
    if (component === 'ImageCompressionTool') f.e.preview.value = { ...image, outputHash: 'b'.repeat(64) }
    const save = component === 'ImageCompressionTool' ? f.e.saveCompressed() : f.e.convertAndSave()
    await f.e.cancel(); f.pending.shift().resolve('C:\\fixture\\late-output.png'); await save
    eq(f.calls.filter(c => ['compress_image_file', 'convert_image_file'].includes(c.command)).length, 0)
  }
  const io = read('src-tauri/src/image_io.rs'), codec = read('src-tauri/src/image_codec.rs'), native = read('src-tauri/src/image_conversion.rs')
  for (const part of ['Directory::parent(path)', 'parent.read(&name)', 'let before = stamp(&file)?', 'stamp(&file)? != before',
    'bytes.len() as u64 + count as u64 > MAX_INPUT', 'try_reserve_exact', 'expected.is_some_and', 'parent.create(&name)',
    'output.file.seek(SeekFrom::Start(0))', 'hash.finalize()', 'output.persist()?; output.accept()', 'lease.cancelled()',
    'Duration::from_secs(60)', 'impl Seek for BoundedOutput', 'impl Read for CheckedReader', 'checked_add', 'io::ErrorKind::Other']) ok(io.includes(part))
  ok(!/OpenOptions|remove_file|canonicalize|fs::metadata/.test(io + codec + native))
  ok(!io.includes('ErrorKind::Interrupted'))
  for (const part of ['reader.limits(limits.clone())', 'decoder.set_limits(limits)', 'decoder.total_bytes() > MAX_DECODE_BYTES',
    'width == 0 || height == 0', '40_000_000', 'Some(16384)', 'max_alloc = Some(MAX_DECODE_BYTES)', 'CheckedReader::new',
    'BoundedOutput::new(ctx, MAX_OUTPUT)', 'image.apply_orientation(orientation)', 'flatten(image, ctx)', 'ctx.check()?']) ok(codec.includes(part))
  ok(codec.indexOf('reader.limits') < codec.indexOf('reader.into_decoder'))
  ok(codec.indexOf('decoder.total_bytes()') < codec.indexOf('DynamicImage::from_decoder'))
  for (const part of ['acquire_job(&job_id)', 'spawn_blocking', 'Some(&expected_hash)', 'image_io::digest(&encoded) != expected_output_hash',
    'source_hash: hash', 'image_io::save(&output_path, &encoded, &ctx)']) ok(native.includes(part))
  ok(native.indexOf('image_io::digest(&encoded) != expected_output_hash') < native.indexOf('image_io::save'))
  console.log(`${checks} native image lifecycle and source assertions passed. Rust/Windows codecs and IO NOT run.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
