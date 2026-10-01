interface Unit { id: string; factor?: number }
export function convertUnit(source: string, temperature: boolean, from: Unit, to: Unit): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source.trim())) throw new Error('请输入十进制数字，可使用科学计数法。')
  const amount = Number(source)
  if (!Number.isFinite(amount) || (amount === 0 && /[1-9]/.test(source.split(/[eE]/)[0]))) throw new Error('输入超出可计算范围或发生下溢。')
  let result: number
  if (from.id === to.id) result = amount
  else if (temperature) {
    const celsius = from.id === 'c' ? amount : from.id === 'f' ? (amount - 32) * (5 / 9) : amount - 273.15
    result = to.id === 'c' ? celsius : to.id === 'f' ? celsius * (9 / 5) + 32 : celsius + 273.15
  } else {
    // Divide factors first, so an otherwise finite result cannot overflow at an
    // unnecessary multiply-then-divide intermediate (e.g. 1e308 km -> km).
    result = amount * ((from.factor ?? 1) / (to.factor ?? 1))
    if (amount !== 0 && result === 0) throw new Error('换算结果过小，发生下溢；请改用较小目标单位。')
  }
  if (!Number.isFinite(result)) throw new Error('换算结果超出可计算范围，请减小输入或改用较大目标单位。')
  return result
}
export function formatUnitValue(value: number): string {
  if (!Number.isFinite(value)) throw new Error('换算结果不是有限数值。')
  if (value === 0) return '0'
  const rounded = Number(value.toPrecision(15))
  return (Number.isFinite(rounded) ? rounded : value).toString()
}
