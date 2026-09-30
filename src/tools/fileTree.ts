import { parseFileScan, type FileRow } from './fileScan'
import type { DiagnosticResult } from './useNativeDiagnostic'
export interface TreeRow extends FileRow { relative: string; kind: 'file' | 'directory' }
export interface TreeSnapshot { rows: TreeRow[]; complete: boolean; skipped: number; reasons: string[] }
export function treeSnapshot(root: string, result: DiagnosticResult | null): TreeSnapshot {
  const parsed = parseFileScan(result?.output ?? ''), rows: TreeRow[] = []
  const prefix = root.replaceAll('/', '\\').replace(/\\$/, '') + '\\'
  let invalid = false
  for (const row of parsed.rows) {
    const relative = row.path.startsWith(prefix) ? row.path.slice(prefix.length) : ''
    if (!relative || relative.split('\\').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f/:]/.test(p))
      || (row.kind !== 'file' && row.kind !== 'directory')) { invalid = true; continue }
    rows.push({ ...row, relative, kind: row.kind })
  }
  return { rows, complete: !!result && result.status === 'completed' && result.exitCode === 0 && !parsed.limited && !invalid,
    skipped: parsed.summary?.skipped ?? 0, reasons: parsed.summary?.reasons ?? [] }
}
export type ComparisonStatus = 'leftOnly' | 'rightOnly' | 'unverifiedLeft' | 'unverifiedRight' | 'typeChanged' | 'metadataChanged' | 'metadataSame'
export interface ComparisonRow { relative: string; left?: TreeRow; right?: TreeRow; status: ComparisonStatus }
export const comparisonLabels: Record<ComparisonStatus, string> = {
  leftOnly: '仅左侧', rightOnly: '仅右侧', unverifiedLeft: '左侧已读取，右侧未知', unverifiedRight: '右侧已读取，左侧未知',
  typeChanged: '类型不同', metadataChanged: '元数据不同', metadataSame: '元数据相同（未比较内容）',
}
export function compareTrees(left: TreeSnapshot, right: TreeSnapshot): ComparisonRow[] {
  // Exact relative names preserve case-sensitive directory behavior. Different
  // casing is deliberately not silently collapsed into a single entry.
  const a = new Map(left.rows.map(r => [r.relative, r])), b = new Map(right.rows.map(r => [r.relative, r]))
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(relative => {
    const l = a.get(relative), r = b.get(relative)
    const status: ComparisonStatus = !l ? (left.complete ? 'rightOnly' : 'unverifiedRight')
      : !r ? (right.complete ? 'leftOnly' : 'unverifiedLeft') : l.kind !== r.kind ? 'typeChanged'
      : (l.kind === 'file' && l.bytes !== r.bytes) || l.modifiedMs !== r.modifiedMs ? 'metadataChanged' : 'metadataSame'
    return { relative, left: l, right: r, status }
  })
}
