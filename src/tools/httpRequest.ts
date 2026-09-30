export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export function prepareHttpRequest(address: string, method: string, headerText: string, body: string) {
  const raw = address.trim()
  if (raw.length > 4096 || !/^https?:\/\//.test(raw) || /[\s\\#]/.test(raw)) throw new Error('请输入不含空格、片段或凭据的 HTTP(S) 完整地址')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('请求地址无效') }
  if (url.username || url.password || !url.hostname || url.href.length > 4096) throw new Error('不接受地址中的用户名或密码')
  if (!(HTTP_METHODS as readonly string[]).includes(method)) throw new Error('不支持此请求方法')
  if (new TextEncoder().encode(body).length > 65536) throw new Error('请求正文最多 64 KiB UTF-8')
  if (['GET', 'HEAD'].includes(method) && body) throw new Error('GET / HEAD 不发送正文，请清空正文或切换方法')
  const headers: { name: string; value: string }[] = [], names = new Set<string>()
  let size = 0
  for (const line of headerText.split(/\r?\n/)) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon < 1) throw new Error('请求头格式应为 Name: value，每行一项')
    const name = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim(), lower = name.toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/.test(name) || /[^\x20-\x7e]/.test(value)) throw new Error('请求头名称无效或值含控制/非 ASCII 字符')
    if (names.has(lower)) throw new Error('同名请求头仅支持一项')
    if (['host', 'content-length', 'transfer-encoding', 'connection', 'expect', 'proxy-authorization', 'upgrade'].includes(lower)) throw new Error('此请求头由 HTTP 客户端管理或不受支持')
    if (lower.startsWith('content-') && ['GET', 'HEAD'].includes(method)) throw new Error('GET / HEAD 不支持内容请求头')
    names.add(lower); headers.push({ name, value }); size += name.length + value.length
  }
  if (headers.length > 32 || size > 8192) throw new Error('请求头最多 32 项、合计 8 KiB')
  return { url: url.href, method, headers, body }
}
