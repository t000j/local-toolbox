import { calculateHash, MAX_HASH_FILE, type HashAlgorithm } from './hash'
export type ChecksumFormat = 'hex' | 'gnu' | 'bsd'
export type ChecksumRequest = { algorithm: HashAlgorithm; format: ChecksumFormat; expected: string; file: File }
export type ParsedChecksum = { digest: string; filename: string | null }
export type ChecksumResult = ParsedChecksum & { actual: string; matches: boolean; name: string; size: number; algorithm: HashAlgorithm }
export const CHECKSUM_LENGTHS: Record<HashAlgorithm, number> = { MD5: 32, 'SHA-1': 40, 'SHA-256': 64, 'SHA-384': 96, 'SHA-512': 128 }
const aliases: Record<string, HashAlgorithm> = {
  MD5: 'MD5', SHA1: 'SHA-1', 'SHA-1': 'SHA-1', SHA256: 'SHA-256', 'SHA-256': 'SHA-256',
  SHA384: 'SHA-384', 'SHA-384': 'SHA-384', SHA512: 'SHA-512', 'SHA-512': 'SHA-512',
}
export function parseChecksum(value: string, algorithm: HashAlgorithm, format: ChecksumFormat): ParsedChecksum {
  if (!Object.hasOwn(CHECKSUM_LENGTHS, algorithm)) throw new Error('请选择支持的摘要算法。')
  if (!value || value.length > 4096) throw new Error('校验值输入须为 1–4096 字符。')
  const line = value.replace(/\r?\n$/u, '')
  if (/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(line)) throw new Error('只支持单条校验记录，不支持多行清单或控制字符。')
  let digest: string, filename: string | null = null
  if (format === 'hex') digest = line.trim()
  else if (format === 'gnu') {
    const match = /^([0-9a-f]+) ([ *])(.+)$/iu.exec(line)
    if (!match) throw new Error('GNU 格式应为「摘要  文件名」或「摘要 *文件名」；不支持转义文件名。')
    digest = match[1]; filename = match[3]
  } else if (format === 'bsd') {
    const match = /^(MD5|SHA-?1|SHA-?256|SHA-?384|SHA-?512) \((.+)\) = ([0-9a-f]+)$/iu.exec(line)
    if (!match || aliases[match[1].toUpperCase()] !== algorithm) throw new Error('BSD 记录格式错误，或其算法与当前选择不同。')
    filename = match[2]; digest = match[3]
  } else throw new Error('请选择十六进制、GNU 或 BSD 格式。')
  if (!/^[0-9a-f]+$/iu.test(digest) || digest.length !== CHECKSUM_LENGTHS[algorithm]) {
    throw new Error(`${algorithm} 需要恰好 ${CHECKSUM_LENGTHS[algorithm]} 个十六进制字符；不支持 Base64、0x 前缀或分隔符。`)
  }
  if (filename !== null && (filename.length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(filename)
    || filename === '.' || filename === '..' || filename.trim() !== filename)) {
    throw new Error('记录只支持单个文件名，不支持目录路径、前后空白或转义名称。')
  }
  return { digest: digest.toLowerCase(), filename }
}
export async function verifyChecksum(request: ChecksumRequest): Promise<ChecksumResult> {
  const parsed = parseChecksum(request.expected, request.algorithm, request.format)
  if (!(request.file instanceof Blob) || typeof request.file.name !== 'string' || request.file.size > MAX_HASH_FILE) {
    throw new Error('请选择不超过 256 MiB 的本地文件。')
  }
  if (parsed.filename !== null && parsed.filename !== request.file.name) {
    throw new Error('校验记录中的文件名与选中文件不完全相同；如确实是同一文件，请改用纯十六进制格式并核对来源。')
  }
  const actual = await calculateHash({ algorithm: request.algorithm, value: request.file })
  return { ...parsed, actual, matches: actual === parsed.digest, name: request.file.name, size: request.file.size,
    algorithm: request.algorithm }
}
