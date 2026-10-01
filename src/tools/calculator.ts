type Token = { type: 'number' | 'operator' | 'left' | 'right'; value: string }

function tokenize(source: string): Token[] {
  const normalized = source.replace(/×/g, '*').replace(/÷/g, '/')
  const tokens: Token[] = []
  let position = 0
  while (position < normalized.length) {
    const character = normalized[position]
    if (/\s/.test(character)) {
      position++
      continue
    }
    const number = normalized.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
    if (number) {
      tokens.push({ type: 'number', value: number[0] })
      position += number[0].length
    } else if ('+-*/'.includes(character)) {
      tokens.push({ type: 'operator', value: character })
      position++
    } else if (character === '(' || character === ')') {
      tokens.push({ type: character === '(' ? 'left' : 'right', value: character })
      position++
    } else {
      throw new Error(`不支持字符“${character}”。`)
    }
    if (tokens.length > 200) throw new Error('表达式过长，请分步计算。')
  }
  return tokens
}

export function evaluate(source: string): number {
  if (source.length > 300) throw new Error('表达式过长，请分步计算。')
  const tokens = tokenize(source)
  if (!tokens.length) throw new Error('请输入要计算的表达式。')
  let position = 0

  function parsePrimary(): number {
    const token = tokens[position]
    if (token?.type === 'number') {
      position++
      const value = Number(token.value)
      if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(token.value.split(/[eE]/)[0]))) throw new Error('数字超出可计算范围或发生下溢。')
      return value
    }
    if (token?.type === 'left') {
      position++
      const value = parseExpression()
      if (tokens[position]?.type !== 'right') throw new Error('括号没有配对。')
      position++
      return value
    }
    throw new Error('这里需要数字或左括号。')
  }

  function parseUnary(): number {
    const token = tokens[position]
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      position++
      const value = parseUnary()
      return token.value === '-' ? -value : value
    }
    return parsePrimary()
  }

  function parseTerm(): number {
    let value = parseUnary()
    while (tokens[position]?.type === 'operator' && ['*', '/'].includes(tokens[position].value)) {
      const operator = tokens[position++].value
      const right = parseUnary()
      if (operator === '/' && right === 0) throw new Error('除数不能为零。')
      const next = operator === '*' ? value * right : value / right
      if (!Number.isFinite(next) || (next === 0 && value !== 0 && right !== 0)) throw new Error('结果超出可计算范围或发生下溢。')
      value = next
    }
    return value
  }

  function parseExpression(): number {
    let value = parseTerm()
    while (tokens[position]?.type === 'operator' && ['+', '-'].includes(tokens[position].value)) {
      const operator = tokens[position++].value
      const right = parseTerm()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  const result = parseExpression()
  if (position < tokens.length) throw new Error(tokens[position].type === 'right' ? '括号没有配对。' : '运算符之间缺少数字。')
  if (!Number.isFinite(result)) throw new Error('结果超出可计算范围。')
  return result
}

export function formatNumber(value: number): string {
  if (value === 0) return '0'
  const rounded = Number(value.toPrecision(12))
  return (Number.isFinite(rounded) ? rounded : value).toString()
}
