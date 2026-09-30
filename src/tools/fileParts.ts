export function chunkBytes(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error('分块大小请输入 1–64 的整数（MiB）')
  return value * 1024 * 1024
}
export function partPrefix(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error('输出前缀限 1–64 个字母、数字、下划线或连字符')
  return value
}
export interface PartsOutcome { mode: 'split' | 'merge'; bytes: number; partCount: number; outputPath: string; sha256: string }
export function parsePartsOutcome(output: string): PartsOutcome | null {
  try {
    const r = JSON.parse(output)
    if (!r || !['split', 'merge'].includes(r.mode) || !Number.isSafeInteger(r.bytes) || r.bytes < 0 || r.bytes > 512 * 1024 * 1024
      || !Number.isSafeInteger(r.partCount) || r.partCount < 1 || r.partCount > 512
      || typeof r.outputPath !== 'string' || !r.outputPath || r.outputPath.length > 1200 || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) return null
    return r
  } catch { return null }
}
