export interface RgbaColor { r: number; g: number; b: number; a: number }
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
function numeric(value: string, min: number, max: number): number {
  if (!NUMBER.test(value)) throw new Error('颜色参数必须是有限十进制数。')
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`颜色参数超出 ${min}–${max} 范围。`)
  return number
}
const alpha = (value: string): number => value.endsWith('%') ? numeric(value.slice(0, -1), 0, 100) / 100 : numeric(value, 0, 1)
export function hslToRgb(h: number, s: number, l: number, a = 1): RgbaColor {
  if (![h, s, l, a].every(Number.isFinite) || s < 0 || s > 100 || l < 0 || l > 100 || a < 0 || a > 1) throw new Error('HSL 参数范围无效。')
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s, x = chroma * (1 - Math.abs((h / 60) % 2 - 1)), m = l - chroma / 2
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return { r: Math.max(0, Math.min(255, (r + m) * 255)), g: Math.max(0, Math.min(255, (g + m) * 255)), b: Math.max(0, Math.min(255, (b + m) * 255)), a }
}
export function parseColor(input: string): RgbaColor {
  if (input.length > 256) throw new Error('颜色输入最多 256 字符。')
  const text = input.trim().toLowerCase(), hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (hex) {
    const full = hex[1].length < 5 ? [...hex[1]].map(c => c + c).join('') : hex[1]
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 }
  }
  const match = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/.exec(text)
  if (!match) throw new Error('支持 #RGB / #RGBA / #RRGGBB / #RRGGBBAA，以及 rgb(a) / hsl(a)。')
  const body = match[2].trim(); let channels: string[], a = 1
  if (body.includes(',')) {
    if (body.includes('/')) throw new Error('不能混用逗号和斜杠分隔。')
    channels = body.split(',').map(v => v.trim())
    if (channels.length === 4) a = alpha(channels.pop()!)
  } else {
    const halves = body.split('/')
    if (halves.length > 2) throw new Error('最多一个透明度斜杠。')
    if (halves.length === 2) a = alpha(halves[1].trim())
    channels = halves[0].trim().split(/\s+/)
  }
  if (channels.length !== 3) throw new Error('颜色需要三个通道参数及可选透明度。')
  if (match[1].startsWith('rgb')) {
    const percent = channels[0].endsWith('%')
    if (channels.some(v => v.endsWith('%') !== percent)) throw new Error('RGB 三个通道须统一使用数值或百分比。')
    const [r, g, b] = channels.map(v => percent ? numeric(v.slice(0, -1), 0, 100) * 255 / 100 : numeric(v, 0, 255))
    return { r, g, b, a }
  }
  const hue = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|grad|rad|turn)?$/.exec(channels[0])
  if (!hue || !channels[1].endsWith('%') || !channels[2].endsWith('%')) throw new Error('HSL 需要角度及两个百分比。')
  const h = numeric(hue[1], -1e9, 1e9) * ({ deg: 1, grad: .9, rad: 180 / Math.PI, turn: 360 }[hue[2] || 'deg']!)
  return hslToRgb(h, numeric(channels[1].slice(0, -1), 0, 100), numeric(channels[2].slice(0, -1), 0, 100), a)
}
export function rgbToHsl(color: RgbaColor): [number, number, number] {
  const r = color.r / 255, g = color.g / 255, b = color.b / 255, high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low, l = (high + low) / 2
  let h = 0, s = 0
  if (delta) { s = delta / (1 - Math.abs(2 * l - 1)); h = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4; h *= 60 }
  return [(h + 360) % 360, Math.max(0, Math.min(100, s * 100)), Math.max(0, Math.min(100, l * 100))]
}
export function formatColor(color: RgbaColor) {
  if (![color.r, color.g, color.b].every(n => Number.isFinite(n) && n >= 0 && n <= 255) || !Number.isFinite(color.a) || color.a < 0 || color.a > 1) throw new Error('RGBA 参数范围无效。')
  const number = (n: number) => String(Number(n.toFixed(6))), byte = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()
  const hex = '#' + [color.r, color.g, color.b].map(byte).join(''), [h, s, l] = rgbToHsl(color)
  return { hex: color.a === 1 ? hex : hex + byte(color.a * 255), hex8: hex + byte(color.a * 255), rgb: `rgb(${number(color.r)} ${number(color.g)} ${number(color.b)} / ${number(color.a)})`, hsl: `hsl(${number(h === 360 ? 0 : h)} ${number(s)}% ${number(l)}% / ${number(color.a)})` }
}
