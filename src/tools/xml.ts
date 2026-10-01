const MAX_BYTES = 1024 * 1024
const MAX_NODES = 50_000
const MAX_DEPTH = 128
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

export function formatXml(input: string, indent = 2): string {
  if (!input.trim()) throw new Error('请输入 XML 内容。')
  if (new TextEncoder().encode(input).length > MAX_BYTES) throw new Error('XML 输入不能超过 1 MiB。')
  if (indent !== 2 && indent !== 4) throw new Error('缩进仅支持 2 或 4 个空格。')
  // Reject DTDs before parsing, so external entities and entity expansion are never processed.
  const markup = input.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, '')
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(markup)) throw new Error('不支持 DTD 或实体声明，请移除后重试。')
  const document = new DOMParser().parseFromString(input, 'application/xml')
  const failure = Array.from(document.getElementsByTagName('parsererror')).find(element =>
    element.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml'
    || element.namespaceURI === 'http://www.w3.org/1999/xhtml')
  if (failure || !document.documentElement) {
    throw new Error(failure?.textContent?.trim().slice(0, 600) || 'XML 结构不正确。')
  }
  let count = 0
  const pending: Array<[Node, number]> = [[document, 0]]
  while (pending.length) {
    const [node, depth] = pending.pop()!
    if (++count > MAX_NODES) throw new Error('XML 节点数不能超过 50,000。')
    if (depth > MAX_DEPTH) throw new Error('XML 嵌套层级不能超过 128。')
    for (const child of Array.from(node.childNodes)) pending.push([child, depth + 1])
  }

  function layout(element: Element, depth: number, inheritedPreserve: boolean): void {
    const space = element.getAttributeNS(XML_NAMESPACE, 'space')
    const preserve = space === 'preserve' || (space !== 'default' && inheritedPreserve)
    const children = Array.from(element.childNodes)
    // Mixed content is left untouched, including descendant spacing; adding indentation could change its text.
    const mixed = children.some(node => {
      if (node.nodeType === 4) return true
      if (node.nodeType !== 3) return false
      const text = node.textContent || ''
      return !/^[ \t\r\n]*$/.test(text) || /^[ \t]+$/.test(text)
    })
    if (preserve || mixed) return
    const structural = children.filter(node => node.nodeType !== 3)
    if (!structural.length) return
    for (const child of children) if (child.nodeType === 3) element.removeChild(child)
    for (const child of structural) {
      if (child.nodeType === 1) layout(child as Element, depth + 1, preserve)
      element.insertBefore(document.createTextNode('\n' + ' '.repeat((depth + 1) * indent)), child)
    }
    element.appendChild(document.createTextNode('\n' + ' '.repeat(depth * indent)))
  }

  layout(document.documentElement, 0, false)
  const serializer = new XMLSerializer()
  const declaration = input.replace(/^\uFEFF/, '').match(/^<\?xml\s[^?]*\?>/)?.[0]
  const body = Array.from(document.childNodes).map(node => serializer.serializeToString(node)).join('\n')
  const output = declaration ? `${declaration}\n${body}` : body
  if (new TextEncoder().encode(output).length > 4 * MAX_BYTES) throw new Error('格式化结果超过 4 MiB，请减少输入或缩进。')
  return output
}
