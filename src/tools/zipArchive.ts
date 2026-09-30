import { deflateSync, zipSync, type Zippable } from 'fflate'
import { Inflate } from 'pako'

export const MAX_ZIP_BYTES = 32 * 1024 * 1024
export const MAX_ZIP_OUTPUT = 16 * 1024 * 1024
export const MAX_ZIP_FILES = 200
export const MAX_ZIP_TOTAL = 64 * 1024 * 1024
export type ZipInput = { name: string; file: Blob; directory?: boolean }
export type ZipTreeEntry = { name: string; directory: boolean; content: string; size: number; crc: number }
export type ZipEntry = { name: string; size: number; packed: number; crc: number; method: number; start: number; directory: boolean }
export type ZipRequest = { mode: 'browse' | 'extract' | 'extractAll'; file: Blob; index?: number }
  | { mode: 'create'; files: ZipInput[] }
export type ZipResult = { entries: ZipEntry[]; bytes?: Uint8Array; name?: string; tree?: ZipTreeEntry[] }
function fail(message = 'ZIP 结构无效或不受支持。'): never { throw new Error(message) }

export function validZipName(name: string): boolean {
  if (!name || name.length > 512 || name.includes('\\') || name.startsWith('/') || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(name)) return false
  const parts = name.replace(/\/$/u, '').split('/')
  return parts.length <= 16 && parts.every(part => part.length <= 120 && !!part && !/[<>:"|?*]/u.test(part)
    && !/[. ]$/u.test(part) && part !== '.' && part !== '..' && !/^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:[ .]|$)/iu.test(part))
}
export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}
export function inspectZip(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22 || bytes.length > MAX_ZIP_BYTES) fail('ZIP 最多 32 MiB，且必须有完整目录。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (p: number) => view.getUint16(p, true), u32 = (p: number) => view.getUint32(p, true)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--
  if (end < Math.max(0, bytes.length - 65557)) fail()
  const count = u16(end + 10), length = u32(end + 12), offset = u32(end + 16)
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count > MAX_ZIP_FILES
    || offset + length !== end || offset > end) fail('拒绝分卷、ZIP64、尾随数据或超过 200 项的 ZIP。')
  const entries: ZipEntry[] = [], names = new Set<string>(), spans: [number, number][] = []
  let p = offset, total = 0
  const nameAt = (start: number, size: number, flags: number): string => {
    const raw = bytes.subarray(start, start + size)
    if (!(flags & 0x800) && raw.some(byte => byte > 127)) fail('非 ASCII 名称必须使用 ZIP UTF-8 标记。')
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw) } catch { return fail('文件名不是有效 UTF-8。') }
  }
  const extras = (start: number, size: number) => {
    let q = start
    while (q < start + size) {
      if (q + 4 > start + size) fail()
      const id = u16(q), n = u16(q + 2)
      if (q + 4 + n > start + size || [1, 0x7075, 0x6375, 0x756e].includes(id)) fail('不支持 ZIP64 或替代名称/链接扩展。')
      q += 4 + n
    }
  }
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50) fail()
    const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16), packed = u32(p + 20), size = u32(p + 24)
    const n = u16(p + 28), x = u16(p + 30), comment = u16(p + 32), external = u32(p + 38), local = u32(p + 42)
    const kind = (external >>> 16) & 0xf000
    if (p + 46 + n + x + comment > end || u16(p + 34) || flags & ~0x80e || ![0, 8].includes(method)
      || (method === 0 && flags & 6) || ![0, 0x4000, 0x8000].includes(kind) || external & 0x400) fail('拒绝加密、链接、设备或不支持的压缩方式。')
    const name = nameAt(p + 46, n, flags), directory = name.endsWith('/'), key = name.replace(/\/$/u, '').normalize('NFC').toLowerCase()
    if (!validZipName(name) || names.has(key) || (kind === 0x4000 && !directory) || (kind === 0x8000 && directory)) fail('ZIP 名称不安全、重复或类型冲突。')
    names.add(key); extras(p + 46 + n, x)
    total += size
    if (size > MAX_ZIP_OUTPUT || total > MAX_ZIP_TOTAL || size > Math.max(1, packed) * 200
      || (method === 0 && size !== packed) || (directory && (size || packed || crc || method !== 0))) fail('超过解压大小/比例预算，或目录/存储条目无效。')
    if (local + 30 > offset || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) fail()
    const ln = u16(local + 26), lx = u16(local + 28), start = local + 30 + ln + lx
    if (start + packed > offset || nameAt(local + 30, ln, flags) !== name) fail()
    extras(local + 30 + ln, lx)
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== packed || u32(local + 22) !== size)) fail()
    let finish = start + packed
    if (flags & 8) {
      if (finish + 12 > offset) fail()
      const signed = u32(finish) === 0x08074b50
      const d = finish + (signed ? 4 : 0)
      if (d + 12 > offset || u32(d) !== crc || u32(d + 4) !== packed || u32(d + 8) !== size) fail()
      finish = d + 12
    }
    spans.push([local, finish]); entries.push({ name, size, packed, crc, method, start, directory })
    p += 46 + n + x + comment
  }
  if (p !== end) fail()
  spans.sort((a, b) => a[0] - b[0])
  let previous = 0
  for (const [start, finish] of spans) { if (start !== previous) fail('拒绝重叠、隐藏数据或自解压前缀。'); previous = finish }
  if (previous !== offset) fail()
  zipTreePlan(entries, false)
  return entries
}
export function extractZip(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.directory) fail('请选择普通文件；目录请使用整包解压。')
  const packed = bytes.subarray(entry.start, entry.start + entry.packed)
  let output: Uint8Array
  if (entry.method === 0) output = packed.slice()
  else {
    const chunks: Uint8Array[] = []; let size = 0, status: number | undefined
    // Raw Deflate, fixed-size output chunks, and exact compressed-input
    // consumption. fflate's Inflate accepts trailing bytes; do not use it here.
    const stream = new Inflate({ chunkSize: 16 * 1024, windowBits: -15 })
    stream.onData = chunk => {
      size += chunk.length
      if (chunk.length > 16 * 1024 || size > entry.size || size > MAX_ZIP_OUTPUT) fail('实际展开数据超过声明大小，已终止。')
      chunks.push(chunk)
    }
    stream.onEnd = value => { status = value }
    // false only ends on Z_STREAM_END; true can finalize truncated pako input.
    if (!packed.length || !stream.push(packed, false) || !stream.ended || stream.err || status !== 0
      || stream.strm.avail_in !== 0 || stream.strm.next_in !== packed.length || stream.strm.total_in !== packed.length) fail('Deflate 被截断、无效或含尾随压缩数据。')
    output = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc) fail('大小或 CRC32 校验失败；不提供损坏输出。')
  return output
}
/** Resolve implicit directories before output; aliases never merge silently. */
export function zipTreePlan<T extends { name: string; directory: boolean }>(entries: T[], bounded = true): { name: string; directory: boolean; source?: T }[] {
  const nodes = new Map<string, { name: string; directory: boolean; source?: T }>()
  for (const entry of entries) {
    if (!validZipName(entry.name) || entry.directory !== entry.name.endsWith('/')) fail('条目名称与类型不符。')
    const parts = entry.name.replace(/\/$/u, '').split('/')
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/'), directory = i < parts.length || entry.directory
      const name = path + (directory ? '/' : ''), key = path.normalize('NFC').toLowerCase(), prior = nodes.get(key)
      if (prior && (prior.name !== name || prior.directory !== directory || (i === parts.length && prior.source))) fail('拒绝重复名称、大小写/Unicode 别名或文件目录冲突。')
      const node = prior ?? { name, directory }
      if (i === parts.length) node.source = entry
      nodes.set(key, node)
      if (bounded && nodes.size > MAX_ZIP_FILES) fail('包括隐含父目录在内最多 200 项。')
    }
  }
  return [...nodes.values()].sort((a, b) => a.name.split('/').length - b.name.split('/').length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
export function zipBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let p = 0; p < bytes.length; p += 32768) binary += String.fromCharCode(...bytes.subarray(p, p + 32768))
  return btoa(binary)
}
export function directoryZipInputs(output: string): ZipInput[] {
  if (output.length > 24 * 1024 * 1024) fail('目录读取回执过大。')
  let parsed: unknown
  try { parsed = JSON.parse(output) } catch { return fail('目录读取回执无效。') }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_ZIP_FILES) fail('目录最多 200 项。')
  let total = 0
  const inputs: ZipInput[] = parsed.map(row => {
    if (!row || typeof row.name !== 'string' || typeof row.directory !== 'boolean' || typeof row.content !== 'string'
      || !Number.isSafeInteger(row.size) || row.size < 0 || row.size > MAX_ZIP_OUTPUT || (row.directory && (row.size || row.content))
      || row.content.length > 4 * Math.ceil(row.size / 3)) fail('目录读取回执无效。')
    total += row.size
    if (total > MAX_ZIP_OUTPUT) fail('创建目录 ZIP 合计最多 16 MiB。')
    let raw: string
    try { raw = atob(row.content) } catch { return fail('目录读取内容无效。') }
    if (raw.length !== row.size) fail('目录读取大小不符。')
    return { name: row.name, directory: row.directory, file: new Blob([Uint8Array.from(raw, ch => ch.charCodeAt(0))]) }
  })
  zipTreePlan(inputs.map(input => ({ ...input, directory: !!input.directory })))
  return inputs
}
export async function runZip(request: ZipRequest): Promise<ZipResult> {
  if (request.mode === 'create') {
    if (!request.files.length || request.files.length > MAX_ZIP_FILES) fail('请选择 1–200 个文件/目录项。')
    const tree: Zippable = Object.create(null); let total = 0
    const inputs = request.files.map(input => ({ ...input, directory: !!input.directory }))
    const nodes = zipTreePlan(inputs)
    for (const { name, directory, source } of nodes) {
      if (directory) {
        if (source && (!(source.file instanceof Blob) || source.file.size)) fail('目录条目必须为空。')
        tree[name] = [new Uint8Array(), { level: 0 }]
        continue
      }
      const file = source?.file
      if (!(file instanceof Blob)) fail('文件条目无效。')
      total += file.size
      if (total > MAX_ZIP_OUTPUT) fail('创建时文件总计最多 16 MiB。')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const compressed = deflateSync(bytes, { level: 6 })
      tree[name] = [bytes, { level: bytes.length > Math.max(1, compressed.length) * 200 ? 0 : 6 }]
    }
    const bytes = zipSync(tree)
    return { entries: inspectZip(bytes), bytes, name: 'archive.zip' }
  }
  if (!(request.file instanceof Blob) || request.file.size > MAX_ZIP_BYTES) fail('ZIP 最多 32 MiB。')
  const bytes = new Uint8Array(await request.file.arrayBuffer()), entries = inspectZip(bytes)
  if (request.mode === 'browse') return { entries }
  if (request.mode === 'extractAll') {
    const tree: ZipTreeEntry[] = []; let total = 0
    for (const node of zipTreePlan(entries)) {
      const data = node.directory ? new Uint8Array() : extractZip(bytes, node.source!)
      total += data.length
      if (total > MAX_ZIP_TOTAL) fail('实际展开总大小超过 64 MiB。')
      tree.push({ name: node.name, directory: node.directory, content: zipBase64(data), size: data.length, crc: node.source?.crc ?? 0 })
    }
    return { entries, tree }
  }
  if (!Number.isInteger(request.index) || request.index! < 0 || request.index! >= entries.length) fail('请选择一个 ZIP 条目。')
  const entry = entries[request.index!]
  return { entries, bytes: extractZip(bytes, entry), name: entry.name.split('/').pop() }
}
