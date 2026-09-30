// All inputs below are generated synthetic bytes; no user files or image-decoder dependencies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript'), zlib = require('node:zlib')
const cache = new Map()
function load(name) {
  const filename = path.resolve('src/tools', `${name}.ts`)
  if (cache.has(filename)) return cache.get(filename)
  const exports = {}; cache.set(filename, exports)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', source)(exports, id => load(id.replace(/^\.\//, '')))
  return exports
}
const { parseImageHeader: parse, IMAGE_INPUT_LIMIT, IMAGE_METADATA_LIMITATIONS } = load('imageHeaders')
let checks = 0
const eq = (a, b) => { assert.deepEqual(a, b); checks++ }, ok = value => { assert.ok(value); checks++ }, bad = (bytes, re) => { assert.throws(() => parse(bytes), re); checks++ }
const b = values => Buffer.from(values), join = (...items) => Buffer.concat(items), u16 = n => { const x = Buffer.alloc(2); x.writeUInt16BE(n); return x }, u32 = n => { const x = Buffer.alloc(4); x.writeUInt32BE(n); return x }
function crc(bytes) { let c = 0xffffffff; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1 } return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data = b([])) => { const body = join(Buffer.from(type), data); return join(u32(data.length), body, u32(crc(body))) }
const signature = b([137, 80, 78, 71, 13, 10, 26, 10]), compressed = zlib.deflateSync(b([0, 123])), iend = chunk('IEND')
const ihdr = (width = 1, height = 1, depth = 8, color = 0) => chunk('IHDR', join(u32(width), u32(height), b([depth, color, 0, 0, 0])))
const png = (middle = [], width = 1, height = 1) => join(signature, ihdr(width, height), ...middle, chunk('IDAT', compressed), iend)
const segment = (marker, data) => join(b([255, marker]), u16(data.length + 2), data)
const frame = (width = 8, height = 8, marker = 0xc0) => segment(marker, join(b([8]), u16(height), u16(width), b([1, 1, 0x11, 0])))
const sos = (start = 0, finish = 63) => segment(0xda, b([1, 1, 0, start, finish, 0]))
const huffman = segment(0xc4, join(b([0, 1, ...Array(15).fill(0), 0]), b([0x10, 1, ...Array(15).fill(0), 0])))
// One gray 8x8 MCU: zero DC difference and EOB, followed by one-bit padding.
const jpeg = (middle = [], width = 8, height = 8) => join(b([255, 216]), ...middle, segment(0xdb, b([0, ...Array(64).fill(1)])), frame(width, height), huffman, sos(), b([0x3f, 255, 217]))
function tiff(little = true, orientation = 6) {
  const groups = [
    [[0x100, 4, [8]], [0x10f, 2, 'Fixture Corp\0'], [0x110, 2, '<camera>\0'], [0x112, 3, [orientation]], [0x8769, 4, 'ifd1'], [0x8825, 4, 'ifd2']],
    [[0x829a, 5, [[1, 125]]], [0x829d, 5, [[28, 10]]], [0x8827, 3, [200]], [0x9003, 2, '2026:09:30 10:00:00\0'], [0x920a, 5, [[50, 1]]], [0xa001, 3, [1]], [0xa434, 2, 'Synthetic 50\0']],
    [[1, 2, 'N\0'], [2, 5, [[51, 1], [30, 1], [0, 1]]], [3, 2, 'W\0'], [4, 5, [[0, 1], [7, 1], [12, 1]]], [5, 1, [0]], [6, 5, [[15, 1]]]],
  ]
  const output = Buffer.alloc(2048), positions = []; let offset = 8
  const w16 = (n, p) => little ? output.writeUInt16LE(n, p) : output.writeUInt16BE(n, p)
  const w32 = (n, p) => little ? output.writeUInt32LE(n, p) : output.writeUInt32BE(n, p)
  output.set(little ? [73, 73] : [77, 77]); w16(42, 2); w32(8, 4)
  for (const group of groups) { positions.push(offset); offset += 2 + group.length * 12 + 4 }
  groups.forEach((group, index) => {
    w16(group.length, positions[index])
    group.forEach(([tag, type, values], i) => {
      const pointer = typeof values === 'string' && values.startsWith('ifd'), count = pointer ? 1 : values.length, size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 })[type]
      const p = positions[index] + 2 + i * 12, length = count * size, data = length <= 4 ? p + 8 : offset
      w16(tag, p); w16(type, p + 2); w32(count, p + 4)
      if (length > 4) { w32(data, p + 8); offset += length; if (offset % 2) offset++ }
      if (pointer) w32(positions[Number(values.slice(3))], data)
      else if (type === 2) output.write(values, data, 'ascii')
      else values.forEach((value, j) => type === 1 ? output[data + j] = value : type === 3 ? w16(value, data + j * 2) : type === 4 ? w32(value, data + j * 4) : (w32(value[0], data + j * 8), w32(value[1], data + j * 8 + 4)))
    })
  })
  return output.subarray(0, offset)
}
const exifJpeg = data => segment(0xe1, join(Buffer.from('Exif\0\0'), data)), field = (header, name) => header.fields.find(row => row.name === name)?.value
const basicPng = png(), basicJpeg = jpeg()
eq(parse(basicPng).format, 'png'); eq(parse(basicJpeg).format, 'jpeg'); eq(parse(basicPng).width, 1); eq(parse(basicJpeg).height, 8)
eq(parse(basicJpeg).orientation, 1); eq(parse(basicPng).animated, false); ok(IMAGE_METADATA_LIMITATIONS.includes('未显示不代表不存在'))
for (const little of [false, true]) for (let orientation = 1; orientation <= 8; orientation++) {
  for (const bytes of [png([chunk('eXIf', tiff(little, orientation))]), jpeg([exifJpeg(tiff(little, orientation))])]) {
    const h = parse(bytes); eq(h.orientation, orientation); eq(field(h, '相机品牌'), 'Fixture Corp'); eq(field(h, 'GPS 纬度（敏感位置）'), '51.500000° (N)'); eq(field(h, 'GPS 经度（敏感位置）'), '-0.120000° (W)')
    eq(field(h, '曝光时间'), '0.008 秒'); eq(field(h, 'EXIF 色彩空间'), 'sRGB'); ok(field(h, '相机型号').includes('\\x3C')); ok(field(h, 'EXIF 读取范围').includes('1 个未支持'))
    ok(h.fields.every(row => row.value.length <= 280 && !row.value.includes('<') && !row.value.includes('>')))
  }
}
for (const input of [b([]), b([255]), b([255,216]), Buffer.from('<svg/>'), b([71,73,70,56,57,97]), null, 'png']) bad(input)
bad(Buffer.alloc(IMAGE_INPUT_LIMIT + 1), /16 MiB/)
for (const [w, h] of [[0, 1], [1, 0], [8193, 1], [1, 8193], [4001, 4000], [8192, 8192]]) { bad(png([], w, h)); bad(jpeg([], w, h)) }
for (const [w, h] of [[8192, 1], [4000, 4000]]) { eq(parse(png([], w, h)).width, w); eq(parse(jpeg([], w, h)).height, h) }
for (const fixture of [basicPng, basicJpeg, png([chunk('eXIf', tiff())]), jpeg([exifJpeg(tiff())])]) for (let i = 0; i < fixture.length; i++) bad(fixture.subarray(0, i))
for (const fixture of [basicPng, basicJpeg]) bad(join(fixture, b([0])))
const corrupted = Buffer.from(basicPng); corrupted[29] ^= 1; bad(corrupted, /CRC/)
bad(join(signature, chunk('IDAT', compressed), iend)); bad(join(signature, ihdr(), ihdr(), chunk('IDAT', compressed), iend)); bad(join(signature, ihdr(), iend))
bad(join(signature, ihdr(), chunk('IDAT'), iend)); bad(png([chunk('ABCD')])); bad(png([chunk('abca')])); bad(join(signature, u32(0xffffffff), Buffer.from('IHDR'), b([0,0,0,0])))
bad(join(signature, ihdr(), chunk('IDAT', compressed), chunk('tEXt'), chunk('IDAT', compressed), iend))
bad(png([chunk('eXIf', tiff()), chunk('eXIf', tiff())])); bad(jpeg([exifJpeg(tiff()), exifJpeg(tiff())]))
for (const orientation of [0, 9, 65535]) bad(jpeg([exifJpeg(tiff(true, orientation))]))
for (const [position, value, width] of [[0, 0, 1], [2, 43, 2], [4, 0xffffffff, 4], [8, 257, 2], [30, 0xffffffff, 4], [66, 8, 4], [82, 8, 4], [22, 0x100, 2], [48, 99, 2]]) {
  const data = Buffer.from(tiff()); width === 1 ? data[position] = value : width === 2 ? data.writeUInt16LE(value, position) : data.writeUInt32LE(value, position); bad(jpeg([exifJpeg(data)]))
}
const zeroRational = Buffer.from(tiff()); zeroRational.writeUInt32LE(0, zeroRational.readUInt32LE(96) + 4); bad(jpeg([exifJpeg(zeroRational)]), /分母/)
const unknownType = Buffer.from(tiff()); unknownType.writeUInt16LE(99, 12); ok(field(parse(jpeg([exifJpeg(unknownType)])), 'EXIF 读取范围').includes('1 个未支持'))
const hugeCount = Buffer.from(tiff()); hugeCount.writeUInt32LE(0xffffffff, 26); bad(jpeg([exifJpeg(hugeCount)]), /越界/)
bad(png([chunk('eXIf', Buffer.alloc(1024 * 1024 + 1))]), /1 MiB/)
bad(png(Array.from({ length: 32769 }, () => chunk('aaAA'))), /块数量/)
const srgb = parse(png([chunk('sRGB', b([0]))])); eq(field(srgb, 'PNG 色彩空间'), 'sRGB；渲染意图 0'); bad(png([chunk('sRGB', b([4]))]))
ok(field(parse(png([chunk('iCCP', join(Buffer.from('test\0'), b([0, 1])))])), 'ICC 配置').includes('未解压'))
ok(field(parse(jpeg([segment(0xe2, join(Buffer.from('ICC_PROFILE\0'), b([1, 1, 0])))])), 'ICC 配置').includes('未组合'))
eq(field(parse(jpeg([segment(0xee, join(Buffer.from('Adobe'), b([0,100,0,0,0,0,1])))])), 'Adobe 色彩变换'), 'YCbCr')
const control = (seq, w = 1, h = 1) => chunk('fcTL', join(u32(seq), u32(w), u32(h), u32(0), u32(0), b([0,1,0,10,0,0])))
const animated = join(signature, ihdr(), chunk('acTL', join(u32(2), u32(0))), control(0), chunk('IDAT', compressed), control(1), chunk('fdAT', join(u32(2), compressed)), iend)
eq(parse(animated).animated, true); eq(field(parse(animated), 'APNG 帧数'), '2'); bad(png([control(0)])); bad(png([chunk('acTL', join(u32(1), u32(0))), control(0, 2)]))
const progressive = join(b([255,216]), frame(8, 8, 0xc2), sos(0,0), b([0x3f]), sos(1,63), b([0x3f,255,217])); eq(parse(progressive).width, 8)
const stuffed = join(basicJpeg.subarray(0, -3), b([0xff,0,0xff,0xd0,0x3f,0xff,0xff,0xd9])); eq(parse(stuffed).width, 8)
for (const marker of [0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) bad(join(b([255,216]), frame(8,8,marker), sos(), b([0x3f,255,217])))
for (const bytes of [b([255,216,255,224,0,1]), b([255,216,255,224,255,255]), b([255,216,255,0]), b([255,216,255,208]), join(basicJpeg.subarray(0,-3), b([255,217])), join(basicJpeg.subarray(0,-3), b([255,255,0,255,217]))]) bad(bytes)
// Deterministic byte mutations exercise safe errors and output bounds, including malformed TIFF offsets.
let random = 0x12345678
for (let i = 0; i < 1500; i++) {
  const original = i % 2 ? jpeg([exifJpeg(tiff())]) : animated, copy = Buffer.from(original)
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0; const index = random % copy.length; copy[index] ^= (random >>> 24) || 1
  try { const h = parse(copy); ok(h.width > 0 && h.height > 0 && h.fields.length < 40 && h.fields.every(row => row.value.length <= 280)) } catch (error) { ok(error instanceof Error && !(error instanceof RangeError) && !(error instanceof TypeError)) }
}
// Pixel files encoded once using Pillow 12.3.0 from synthetic 3x2 images; embedded for dependency-free tests.
const encodedFixtures = [
  ["Pillow JPEG orientation 1","jpeg",3,2,1,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAEAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMoAAAAAAdAKKKK+2j8KPmav8SXqz//Z"],
  ["Pillow JPEG orientation 2","jpeg",3,2,2,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAIAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/CABEIAAIAAwMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABP/EABQBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhADEAAAAZA2Z//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABcRAAMBAAAAAAAAAAAAAAAAAAABAjL/2gAIAQMBAT8BrTP/xAAWEQADAAAAAAAAAAAAAAAAAAAAATH/2gAIAQIBAT8BUP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABYRAAMAAAAAAAAAAAAAAAAAAAABof/aAAgBAwEBPxCxn//EABURAQEAAAAAAAAAAAAAAAAAAAAx/9oACAECAQE/EIP/xAAWEAEBAQAAAAAAAAAAAAAAAAABADH/2gAIAQEAAT8QAAAAMC//2Q=="],
  ["Pillow JPEG orientation 3","jpeg",3,2,3,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAMAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMoAAAAAAdAKKKK+2j8KPmav8SXqz//Z"],
  ["Pillow JPEG orientation 4","jpeg",3,2,4,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAQAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/CABEIAAIAAwMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABP/EABQBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhADEAAAAZA2Z//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABcRAAMBAAAAAAAAAAAAAAAAAAABAjL/2gAIAQMBAT8BrTP/xAAWEQADAAAAAAAAAAAAAAAAAAAAATH/2gAIAQIBAT8BUP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABYRAAMAAAAAAAAAAAAAAAAAAAABof/aAAgBAwEBPxCxn//EABURAQEAAAAAAAAAAAAAAAAAAAAx/9oACAECAQE/EIP/xAAWEAEBAQAAAAAAAAAAAAAAAAABADH/2gAIAQEAAT8QAAAAMC//2Q=="],
  ["Pillow JPEG orientation 5","jpeg",3,2,5,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAUAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMoAAAAAAdAKKKK+2j8KPmav8SXqz//Z"],
  ["Pillow JPEG orientation 6","jpeg",3,2,6,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAYAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/CABEIAAIAAwMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABP/EABQBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhADEAAAAZA2Z//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABcRAAMBAAAAAAAAAAAAAAAAAAABAjL/2gAIAQMBAT8BrTP/xAAWEQADAAAAAAAAAAAAAAAAAAAAATH/2gAIAQIBAT8BUP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABYRAAMAAAAAAAAAAAAAAAAAAAABof/aAAgBAwEBPxCxn//EABURAQEAAAAAAAAAAAAAAAAAAAAx/9oACAECAQE/EIP/xAAWEAEBAQAAAAAAAAAAAAAAAAABADH/2gAIAQEAAT8QAAAAMC//2Q=="],
  ["Pillow JPEG orientation 7","jpeg",3,2,7,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAcAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMoAAAAAAdAKKKK+2j8KPmav8SXqz//Z"],
  ["Pillow JPEG orientation 8","jpeg",3,2,8,false,"/9j/4AAQSkZJRgABAQAAAQABAAD/4QBIRXhpZgAATU0AKgAAAAgAAgEPAAIAAAAZAAAAJgESAAMAAAABAAgAAAAAAABTeW50aGV0aWMgUGlsbG93IEZpeHR1cmUAAP/bAEMACAYGBwYFCAcHBwkJCAoMFA0MCwsMGRITDxQdGh8eHRocHCAkLicgIiwjHBwoNyksMDE0NDQfJzk9ODI8LjM0Mv/bAEMBCQkJDAsMGA0NGDIhHCEyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMv/CABEIAAIAAwMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABP/EABQBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhADEAAAAZA2Z//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABcRAAMBAAAAAAAAAAAAAAAAAAABAjL/2gAIAQMBAT8BrTP/xAAWEQADAAAAAAAAAAAAAAAAAAAAATH/2gAIAQIBAT8BUP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ8//EABYRAAMAAAAAAAAAAAAAAAAAAAABof/aAAgBAwEBPxCxn//EABURAQEAAAAAAAAAAAAAAAAAAAAx/9oACAECAQE/EIP/xAAWEAEBAQAAAAAAAAAAAAAAAAABADH/2gAIAQEAAT8QAAAAMC//2Q=="],
  ["Pillow JPEG CMYK","jpeg",3,2,1,false,"/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/8AAFAgAAgADBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwDyuWWSaV5ZXaSR2LO7HJYnqSe5qqiJFGscaqiKAqqowAB0AFetRxpDEkUSKkaAKqqMBQOgA7Cvf6//2Q=="],
  ["Pillow PNG RGBA with EXIF","png",3,2,6,false,"iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAGmVYSWZNTQAqAAAACAABARIAAwAAAAEABgAAAAAAANZnS2kAAAAiSURBVHicYzzBHPA/qbSHgYGBgYFBq+LO/xQGBiOtijv/AW5ACQ9Dg/6tAAAAAElFTkSuQmCC"],
  ["Pillow PNG palette transparency","png",3,2,1,false,"iVBORw0KGgoAAAANSUhEUgAAAAMAAAACAgMAAADgGo6JAAAADFBMVEUqeNzIA1AAAAAAAABoZpd6AAAABHRSTlP/AID/excXrQAAAAxJREFUeJxjcGBgAAAAxABBvaSt9AAAAABJRU5ErkJggg=="],
  ["Pillow PNG one-bit","png",3,2,1,false,"iVBORw0KGgoAAAANSUhEUgAAAAMAAAACAQAAAAC1D1u3AAAADElEQVR4nGNwYGIAAADIAEPNLySVAAAAAElFTkSuQmCC"],
  ["Pillow PNG 16-bit grayscale","png",3,2,1,false,"iVBORw0KGgoAAAANSUhEUgAAAAMAAAACEAAAAADoj+WFAAAAFklEQVR4nGNkYWBgYGBgYmBgYGBgAAAAXgAIjE9ligAAAABJRU5ErkJggg=="],
  ["Pillow APNG","png",3,2,1,true,"iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAADAAAAAgAAAAAAAAAAAAEACgAAP7ZcWAAAACJJREFUeJxjPMEc8D+ptIeBgYGBgUGr4s7/FAYGI62KO/8BbkAJD0OD/q0AAAAaZmNUTAAAAAEAAAADAAAAAgAAAAAAAAAAAAEACgAApMW2jAAAABdmZEFUAAAAAnicYzyRwrCFAQqYGJAAACyuAeQJ9AyBAAAAAElFTkSuQmCC"],
]
for (const [label, format, width, height, orientation, animated, base64] of encodedFixtures) {
  const h = parse(Buffer.from(base64, 'base64')); eq([h.format,h.width,h.height,h.orientation,h.animated], [format,width,height,orientation,animated]); ok(h.fields.length > 3, label)
}
console.log(`${checks} synthetic image header/metadata assertions passed (no pixel decoding or browser codec claim)`)
