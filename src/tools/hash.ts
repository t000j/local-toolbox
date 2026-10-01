import { createMD5, createSHA1, createSHA256, createSHA384, createSHA512 } from 'hash-wasm'

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
export const MAX_HASH_FILE = 256 * 1024 * 1024
export const MAX_HASH_TEXT = 1024 * 1024
export type HashRequest = { algorithm: HashAlgorithm; value: string | Blob }
const factories = { MD5: createMD5, 'SHA-1': createSHA1, 'SHA-256': createSHA256, 'SHA-384': createSHA384, 'SHA-512': createSHA512 }

export async function calculateHash({ algorithm, value }: HashRequest): Promise<string> {
  if (!Object.hasOwn(factories, algorithm)) throw new Error('不支持此摘要算法。')
  if (typeof value === 'string' && value.length > MAX_HASH_TEXT) throw new Error('文本最多 1 MiB UTF-16 码元。')
  const source = typeof value === 'string' ? new Blob([new TextEncoder().encode(value)]) : value
  if (!(source instanceof Blob) || source.size > MAX_HASH_FILE) throw new Error('文件最多 256 MiB。')
  const hash = await factories[algorithm]()
  hash.init()
  for (let offset = 0; offset < source.size; offset += 1024 * 1024) {
    hash.update(new Uint8Array(await source.slice(offset, offset + 1024 * 1024).arrayBuffer()))
  }
  return hash.digest('hex')
}
