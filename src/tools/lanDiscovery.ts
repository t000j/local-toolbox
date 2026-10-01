export function validateLanCidr(input: string) {
  const cidr = input.trim()
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(26|27|28|29|30)$/.exec(cidr)
  if (!match) throw new Error('请输入 /26–/30 私有 IPv4 网段，例如 192.168.1.0/26')
  const octets = match.slice(1, 5).map(Number)
  if (octets.some((n, i) => n > 255 || String(n) !== match[i + 1])) throw new Error('IPv4 地址无效，不接受前导零')
  const [a, b] = octets
  if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) throw new Error('仅支持 RFC1918 私有网段')
  const size = 2 ** (32 - Number(match[5]))
  if (octets[3] % size) throw new Error('请输入网段起始地址，不是单台设备地址')
  return { cidr, hosts: size - 2 }
}
