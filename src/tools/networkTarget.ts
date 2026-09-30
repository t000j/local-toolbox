/** Accept a single plain ASCII hostname or IP literal, never command syntax/URLs. */
export function validateNetworkTarget(input: string): string {
  if (!input || input.length > 253 || input !== input.trim() || /[^A-Za-z0-9.:-]/.test(input)) {
    throw new Error('请输入单个主机名或 IP，不要包含 URL、端口、空格或命令参数。')
  }
  if (input.includes(':')) {
    try {
      const url = new URL(`http://[${input}]/`)
      if (!url.hostname.startsWith('[')) throw new Error()
      return input
    } catch { throw new Error('IPv6 地址格式无效；不支持区域 ID。') }
  }
  if (/^[0-9.]+$/.test(input)) {
    const parts = input.split('.')
    if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) {
      throw new Error('IPv4 地址应为四段 0–255 的十进制数字。')
    }
    return input
  }
  const hostname = input.endsWith('.') ? input.slice(0, -1) : input
  if (!hostname.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new Error('主机名每段限 1–63 个英文字母、数字或中划线，首尾不能是中划线。')
  }
  return input
}

export function boundedProbeInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`参数必须是 ${min}–${max} 范围内的整数。`)
  return value
}

/** DNS record owners may contain underscores (e.g. DKIM/DMARC), unlike hosts. */
export function validateDnsTarget(input: string): string {
  if (!input.includes('_')) return validateNetworkTarget(input)
  const name = input.endsWith('.') ? input.slice(0, -1) : input
  if (input.length > 253 || !name.split('.').every(label => /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?$/.test(label))) {
    throw new Error('请输入有效 ASCII DNS 记录名称；每段限 1–63 字符，不支持空格、URL 或命令参数。')
  }
  return input
}
