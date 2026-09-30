// Rejection sampling avoids modulo bias. Never fall back to Math.random.
export function secureIndex(size: number): number {
  if (!Number.isSafeInteger(size) || size < 1 || size > 0x100000000) throw new Error('随机范围必须为 1 至 2³²。')
  const limit = Math.floor(0x100000000 / size) * size
  const word = new Uint32Array(1)
  for (let attempt = 0; attempt < 1024; attempt++) {
    crypto.getRandomValues(word)
    if (word[0] < limit) return word[0] % size
  }
  throw new Error('安全随机源未能生成结果，请重试。')
}
export function validateCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('数量必须为 1 至 100 的整数。')
}
export function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < 1 || length > 256) throw new Error('长度必须为 1 至 256 的整数。')
}
export const PASSWORD_GROUPS = {
  lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/',
}
export type PasswordGroup = keyof typeof PASSWORD_GROUPS
export function generatePasswords(length: number, count: number, selected: PasswordGroup[], excludeAmbiguous: boolean): string[] {
  validateCount(count); validateLength(length)
  if (!selected.length || selected.some(key => !Object.hasOwn(PASSWORD_GROUPS, key))) throw new Error('请至少选择一种字符类型。')
  const groups = [...new Set(selected)].map(key => excludeAmbiguous ? PASSWORD_GROUPS[key].replace(/[Il1O0o]/g, '') : PASSWORD_GROUPS[key])
  if (length < groups.length) throw new Error('长度不能少于选中的字符类型数量。')
  const alphabet = groups.join(''), result: string[] = []
  // Uniform strings conditioned on containing every requested group; no forced-position bias.
  for (let attempt = 0; result.length < count && attempt < 10_000; attempt++) {
    const text = Array.from({ length }, () => alphabet[secureIndex(alphabet.length)]).join('')
    if (groups.every(group => [...text].some(char => group.includes(char)))) result.push(text)
  }
  if (result.length !== count) throw new Error('未能生成足够的密码，请增加长度后重试。')
  return result
}
export function generateIntegers(min: number, max: number, count: number): number[] {
  validateCount(count)
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) throw new Error('上下界必须为安全整数，且下界不能大于上界。')
  const size = max - min + 1
  if (size > 0x100000000) throw new Error('区间最多包含 2³² 个整数。')
  return Array.from({ length: count }, () => min + secureIndex(size))
}
export function generateStrings(alphabet: string, length: number, count: number): string[] {
  validateCount(count); validateLength(length)
  if (alphabet.length > 2048) throw new Error('字符池最多 2048 个 UTF-16 码元。')
  const chars = [...new Set(alphabet)]
  if (!chars.length || chars.some(char => /[\u0000-\u0020\u007f-\u009f\ud800-\udfff]/u.test(char))) {
    throw new Error('字符池不能为空，也不能包含空白控制字符或孤立代理项。')
  }
  return Array.from({ length: count }, () => Array.from({ length }, () => chars[secureIndex(chars.length)]).join(''))
}
