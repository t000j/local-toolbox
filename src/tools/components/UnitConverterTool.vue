<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeftRight, Check, Copy, Ruler } from '@lucide/vue'
import { copyText } from '../clipboard'

type UnitGroupId = 'length' | 'mass' | 'area' | 'volume' | 'speed' | 'temperature' | 'data'
interface UnitDefinition { id: string; label: string; factor?: number }
interface UnitGroup { id: UnitGroupId; name: string; units: UnitDefinition[] }

const groups: UnitGroup[] = [
  { id: 'length', name: '长度', units: [
    { id: 'mm', label: '毫米 (mm)', factor: 0.001 }, { id: 'cm', label: '厘米 (cm)', factor: 0.01 },
    { id: 'm', label: '米 (m)', factor: 1 }, { id: 'km', label: '千米 (km)', factor: 1000 },
    { id: 'in', label: '英寸 (in)', factor: 0.0254 }, { id: 'ft', label: '英尺 (ft)', factor: 0.3048 },
    { id: 'mi', label: '英里 (mi)', factor: 1609.344 },
  ] },
  { id: 'mass', name: '质量', units: [
    { id: 'mg', label: '毫克 (mg)', factor: 0.001 }, { id: 'g', label: '克 (g)', factor: 1 },
    { id: 'kg', label: '千克 (kg)', factor: 1000 }, { id: 'oz', label: '盎司 (oz)', factor: 28.349523125 },
    { id: 'lb', label: '磅 (lb)', factor: 453.59237 },
  ] },
  { id: 'area', name: '面积', units: [
    { id: 'm2', label: '平方米 (m²)', factor: 1 }, { id: 'km2', label: '平方千米 (km²)', factor: 1_000_000 },
    { id: 'ha', label: '公顷 (ha)', factor: 10_000 }, { id: 'ft2', label: '平方英尺 (ft²)', factor: 0.09290304 },
    { id: 'acre', label: '英亩 (acre)', factor: 4046.8564224 },
  ] },
  { id: 'volume', name: '体积', units: [
    { id: 'ml', label: '毫升 (mL)', factor: 0.001 }, { id: 'l', label: '升 (L)', factor: 1 },
    { id: 'm3', label: '立方米 (m³)', factor: 1000 }, { id: 'cup', label: '美制杯 (cup)', factor: 0.2365882365 },
    { id: 'gal', label: '美制加仑 (gal)', factor: 3.785411784 },
  ] },
  { id: 'speed', name: '速度', units: [
    { id: 'ms', label: '米/秒 (m/s)', factor: 1 }, { id: 'kmh', label: '千米/小时 (km/h)', factor: 1 / 3.6 },
    { id: 'mph', label: '英里/小时 (mph)', factor: 0.44704 }, { id: 'knot', label: '节 (kn)', factor: 0.514444 },
  ] },
  { id: 'temperature', name: '温度', units: [
    { id: 'c', label: '摄氏度 (°C)' }, { id: 'f', label: '华氏度 (°F)' }, { id: 'k', label: '开尔文 (K)' },
  ] },
  { id: 'data', name: '数据大小', units: [
    { id: 'b', label: '字节 (B)', factor: 1 }, { id: 'kb', label: '千字节 (KB)', factor: 1000 },
    { id: 'mb', label: '兆字节 (MB)', factor: 1_000_000 }, { id: 'gb', label: '吉字节 (GB)', factor: 1_000_000_000 },
    { id: 'tb', label: '太字节 (TB)', factor: 1_000_000_000_000 },
    { id: 'kib', label: '千比字节 (KiB)', factor: 1024 }, { id: 'mib', label: '兆比字节 (MiB)', factor: 1_048_576 },
    { id: 'gib', label: '吉比字节 (GiB)', factor: 1_073_741_824 },
  ] },
]

const groupId = ref<UnitGroupId>('length')
const amount = ref('1')
const fromUnit = ref('km')
const toUnit = ref('mi')
const copied = ref(false)
const error = ref('')
const activeGroup = computed(() => groups.find((group) => group.id === groupId.value) ?? groups[0])
const fromDefinition = computed(() => activeGroup.value.units.find((unit) => unit.id === fromUnit.value) ?? activeGroup.value.units[0])
const toDefinition = computed(() => activeGroup.value.units.find((unit) => unit.id === toUnit.value) ?? activeGroup.value.units[1])
const convertedValue = computed(() => {
  const numericAmount = Number(amount.value)
  if (!amount.value.trim() || !Number.isFinite(numericAmount)) return null
  if (groupId.value === 'temperature') {
    const celsius = fromUnit.value === 'c' ? numericAmount : fromUnit.value === 'f' ? (numericAmount - 32) * 5 / 9 : numericAmount - 273.15
    return toUnit.value === 'c' ? celsius : toUnit.value === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15
  }
  return numericAmount * (fromDefinition.value.factor ?? 1) / (toDefinition.value.factor ?? 1)
})
const formattedResult = computed(() => convertedValue.value === null ? '' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(convertedValue.value))

watch(groupId, (nextGroupId) => {
  const nextGroup = groups.find((group) => group.id === nextGroupId) ?? groups[0]
  fromUnit.value = nextGroup.units[0].id
  toUnit.value = nextGroup.units[1].id
  error.value = ''
  copied.value = false
})

function swapUnits(): void {
  const currentFrom = fromUnit.value
  fromUnit.value = toUnit.value
  toUnit.value = currentFrom
  copied.value = false
}

async function copyResult(): Promise<void> {
  if (!formattedResult.value) return
  try {
    await copyText(formattedResult.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="single-column-tool unit-tool">
    <div class="unit-category-row">
      <button v-for="group in groups" :key="group.id" :class="{ selected: groupId === group.id }" @click="groupId = group.id">{{ group.name }}</button>
    </div>
    <div class="conversion-grid">
      <section class="conversion-field">
        <div class="field-heading"><label for="unit-amount">转换数值</label><Ruler :size="15" class="field-muted-icon" /></div>
        <input id="unit-amount" v-model="amount" class="text-input" inputmode="decimal" placeholder="输入数值" @input="copied = false; error = ''" />
        <div class="field-heading conversion-unit-heading"><label for="unit-from">从</label></div>
        <select id="unit-from" v-model="fromUnit" class="unit-select" @change="copied = false"><option v-for="unit in activeGroup.units" :key="unit.id" :value="unit.id">{{ unit.label }}</option></select>
      </section>
      <button class="unit-swap-button" aria-label="交换单位" @click="swapUnits"><ArrowLeftRight :size="17" /></button>
      <section class="conversion-field">
        <div class="field-heading"><label>转换结果</label><button class="quiet-button" :disabled="!formattedResult" @click="copyResult"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button></div>
        <div class="unit-result-box"><strong>{{ formattedResult || '—' }}</strong><span>{{ toDefinition.label }}</span></div>
        <div class="field-heading conversion-unit-heading"><label for="unit-to">到</label></div>
        <select id="unit-to" v-model="toUnit" class="unit-select" @change="copied = false"><option v-for="unit in activeGroup.units" :key="unit.id" :value="unit.id">{{ unit.label }}</option></select>
      </section>
    </div>
    <p v-if="error" class="inline-error">{{ error }}</p>
    <p v-else class="form-hint"><Check :size="14" /> 当前换算在本机完成。</p>
  </div>
</template>
