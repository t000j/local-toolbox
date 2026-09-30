<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Calculator, Check, Copy } from '@lucide/vue'
import { copyText } from '../clipboard'

type Mode = 'discount' | 'tax' | 'split'
interface ResultRow { label: string; value: string }
interface Calculation { rows: ResultRow[]; note: string; error: string }

const mode = ref<Mode>('discount')
const discountAmount = ref(100)
const discountPercent = ref(20)
const taxAmount = ref(100)
const taxPercent = ref(13)
const splitAmount = ref(100)
const people = ref(3)
const copyError = ref('')
const copied = ref(false)

watch([mode, discountAmount, discountPercent, taxAmount, taxPercent, splitAmount, people], () => {
  copied.value = false
  copyError.value = ''
})

function amountToCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000_000) return null
  const cents = Math.round(value * 100)
  return Number.isSafeInteger(cents) ? cents : null
}

function money(cents: number): string {
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

const calculation = computed<Calculation>(() => {
  if (mode.value === 'discount') {
    const amount = amountToCents(discountAmount.value)
    const percent = Number(discountPercent.value)
    if (amount === null) return { rows: [], note: '', error: '请输入 0 到 100 亿之间的有效金额。' }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { rows: [], note: '', error: '折扣比例需在 0% 到 100% 之间。' }
    const saved = Math.round(amount * percent / 100)
    return {
      rows: [{ label: '原价', value: money(amount) }, { label: '优惠金额', value: money(saved) }, { label: '折后金额', value: money(amount - saved) }],
      note: '金额按人民币分四舍五入。', error: '',
    }
  }

  if (mode.value === 'tax') {
    const amount = amountToCents(taxAmount.value)
    const percent = Number(taxPercent.value)
    if (amount === null) return { rows: [], note: '', error: '请输入 0 到 100 亿之间的有效金额。' }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { rows: [], note: '', error: '税率需在 0% 到 100% 之间。' }
    const tax = Math.round(amount * percent / 100)
    return {
      rows: [{ label: '税前金额', value: money(amount) }, { label: '税额', value: money(tax) }, { label: '含税金额', value: money(amount + tax) }],
      note: '税额按分四舍五入，含税金额为税前金额加税额。', error: '',
    }
  }

  const amount = amountToCents(splitAmount.value)
  const count = Number(people.value)
  if (amount === null) return { rows: [], note: '', error: '请输入 0 到 100 亿之间的有效金额。' }
  if (!Number.isInteger(count) || count < 1 || count > 10_000) return { rows: [], note: '', error: '人数需为 1 到 10,000 之间的整数。' }
  const perPerson = Math.floor(amount / count)
  const extraCentPeople = amount % count
  const rows = [{ label: '总金额', value: money(amount) }, { label: '参与人数', value: `${count} 人` }]
  if (extraCentPeople === 0) rows.push({ label: '每人分摊', value: money(perPerson) })
  else {
    rows.push({ label: '多分 1 分', value: `${extraCentPeople} 人各付 ${money(perPerson + 1)}` })
    rows.push({ label: '基础分摊', value: `${count - extraCentPeople} 人各付 ${money(perPerson)}` })
  }
  return { rows, note: '按人民币分配余数，所有人的分摊金额相加等于总金额。', error: '' }
})

const copyTextValue = computed(() => calculation.value.rows.map((row) => `${row.label}：${row.value}`).join('\n'))

async function copyResult(): Promise<void> {
  if (!copyTextValue.value || calculation.value.error) return
  copyError.value = ''
  try {
    await copyText(copyTextValue.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    copyError.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="price-tools-tool">
    <div class="mode-switch price-tool-mode-switch">
      <button :class="{ selected: mode === 'discount' }" @click="mode = 'discount'; copied = false">折扣计算</button>
      <button :class="{ selected: mode === 'tax' }" @click="mode = 'tax'; copied = false">税额计算</button>
      <button :class="{ selected: mode === 'split' }" @click="mode = 'split'; copied = false">多人分摊</button>
      <span><Calculator :size="13" /> 本机计算</span>
    </div>

    <section v-if="mode === 'discount'" class="price-input-grid">
      <label class="price-input-field"><span>原价（元）</span><input v-model.number="discountAmount" class="text-input" type="number" min="0" max="10000000000" step="0.01" inputmode="decimal" /></label>
      <label class="price-input-field"><span>折扣比例（%）</span><input v-model.number="discountPercent" class="text-input" type="number" min="0" max="100" step="0.1" inputmode="decimal" /></label>
    </section>
    <section v-else-if="mode === 'tax'" class="price-input-grid">
      <label class="price-input-field"><span>税前金额（元）</span><input v-model.number="taxAmount" class="text-input" type="number" min="0" max="10000000000" step="0.01" inputmode="decimal" /></label>
      <label class="price-input-field"><span>税率（%）</span><input v-model.number="taxPercent" class="text-input" type="number" min="0" max="100" step="0.1" inputmode="decimal" /></label>
    </section>
    <section v-else class="price-input-grid">
      <label class="price-input-field"><span>总金额（元）</span><input v-model.number="splitAmount" class="text-input" type="number" min="0" max="10000000000" step="0.01" inputmode="decimal" /></label>
      <label class="price-input-field"><span>参与人数</span><input v-model.number="people" class="text-input" type="number" min="1" max="10000" step="1" inputmode="numeric" /></label>
    </section>

    <section class="price-result-panel">
      <div class="price-result-heading"><strong>计算结果</strong><button class="quiet-button" :disabled="!!calculation.error" @click="copyResult"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button></div>
      <p v-if="calculation.error || copyError" class="inline-error">{{ copyError || calculation.error }}</p>
      <div v-else class="price-result-grid">
        <article v-for="row in calculation.rows" :key="row.label" class="price-result-row"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></article>
      </div>
      <p v-if="!calculation.error" class="price-result-note">{{ calculation.note }}</p>
    </section>
  </div>
</template>
