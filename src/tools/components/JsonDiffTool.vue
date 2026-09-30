<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Braces, Check, CircleAlert, Minus, Plus, RefreshCw } from '@lucide/vue'

type ChangeType = 'added' | 'removed' | 'changed'
interface JsonChange {
  type: ChangeType
  path: string
  before?: unknown
  after?: unknown
}

const leftText = ref('')
const rightText = ref('')
const changes = ref<JsonChange[] | null>(null)
const error = ref('')
const addedCount = computed(() => changes.value?.filter((change) => change.type === 'added').length ?? 0)
const removedCount = computed(() => changes.value?.filter((change) => change.type === 'removed').length ?? 0)
const changedCount = computed(() => changes.value?.filter((change) => change.type === 'changed').length ?? 0)

function owns(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function propertyPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectChanges(before: unknown, after: unknown, path: string, output: JsonChange[]): void {
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    for (let index = 0; index < length; index++) {
      const itemPath = `${path}[${index}]`
      if (index >= before.length) output.push({ type: 'added', path: itemPath, after: after[index] })
      else if (index >= after.length) output.push({ type: 'removed', path: itemPath, before: before[index] })
      else collectChanges(before[index], after[index], itemPath, output)
    }
    return
  }

  if (isObject(before) && isObject(after)) {
    const keys = [...Object.keys(before), ...Object.keys(after).filter((key) => !owns(before, key))]
    for (const key of keys) {
      const keyPath = propertyPath(path, key)
      const hasBefore = owns(before, key)
      const hasAfter = owns(after, key)
      if (!hasBefore) output.push({ type: 'added', path: keyPath, after: after[key] })
      else if (!hasAfter) output.push({ type: 'removed', path: keyPath, before: before[key] })
      else collectChanges(before[key], after[key], keyPath, output)
    }
    return
  }

  if (!Object.is(before, after)) output.push({ type: 'changed', path, before, after })
}

function compare(): void {
  error.value = ''
  changes.value = null
  let before: unknown
  let after: unknown
  try {
    before = JSON.parse(leftText.value)
  } catch (cause) {
    error.value = `左侧 JSON 格式不正确：${cause instanceof Error ? cause.message : '无法解析'}`
    return
  }
  try {
    after = JSON.parse(rightText.value)
  } catch (cause) {
    error.value = `右侧 JSON 格式不正确：${cause instanceof Error ? cause.message : '无法解析'}`
    return
  }

  const result: JsonChange[] = []
  collectChanges(before, after, '$', result)
  changes.value = result
}

function clearAll(): void {
  leftText.value = ''
  rightText.value = ''
  changes.value = null
  error.value = ''
}

function resetResult(): void {
  changes.value = null
  error.value = ''
}

function formatValue(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value)
}
</script>

<template>
  <div class="json-diff-tool">
    <div class="json-diff-input-grid">
      <section class="json-diff-panel">
        <div class="field-heading">
          <label for="json-diff-left">原始 JSON</label>
          <button class="quiet-button" :disabled="!leftText && !rightText" @click="clearAll"><RefreshCw :size="13" /> 清空</button>
        </div>
        <textarea id="json-diff-left" v-model="leftText" class="code-input json-diff-textarea" spellcheck="false" placeholder="粘贴原始 JSON…" @input="resetResult"></textarea>
      </section>
      <section class="json-diff-panel">
        <div class="field-heading"><label for="json-diff-right">对比 JSON</label></div>
        <textarea id="json-diff-right" v-model="rightText" class="code-input json-diff-textarea" spellcheck="false" placeholder="粘贴要比较的 JSON…" @input="resetResult"></textarea>
      </section>
    </div>

    <div class="json-diff-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error"><CircleAlert :size="14" /> {{ error }}</span>
        <span v-else>对象按属性比较并忽略键顺序，数组按索引比较；所有内容仅在本机处理。</span>
      </p>
      <button class="primary-button" :disabled="!leftText.trim() || !rightText.trim()" @click="compare"><Braces :size="15" /> 比较差异</button>
    </div>

    <section v-if="changes !== null" class="json-diff-results">
      <div class="json-diff-results-heading">
        <div><h2>比较结果</h2><span>{{ changes.length ? `共发现 ${changes.length} 处差异` : '两份 JSON 内容一致' }}</span></div>
        <div class="json-diff-counts">
          <span class="diff-count-added"><Plus :size="12" /> {{ addedCount }} 新增</span>
          <span class="diff-count-removed"><Minus :size="12" /> {{ removedCount }} 删除</span>
          <span class="diff-count-changed"><ArrowRight :size="12" /> {{ changedCount }} 修改</span>
        </div>
      </div>
      <div v-if="changes.length" class="json-diff-change-list">
        <article v-for="(change, index) in changes" :key="`${change.path}-${change.type}-${index}`" class="json-diff-change" :class="`change-${change.type}`">
          <div class="json-diff-change-heading">
            <span class="json-diff-kind">{{ change.type === 'added' ? '新增' : change.type === 'removed' ? '删除' : '修改' }}</span>
            <code>{{ change.path }}</code>
          </div>
          <div class="json-diff-values" :class="`diff-values-${change.type}`">
            <div v-if="change.type !== 'added'" class="json-diff-value">
              <span>原值</span><pre>{{ formatValue(change.before) }}</pre>
            </div>
            <div v-if="change.type !== 'removed'" class="json-diff-value">
              <span>新值</span><pre>{{ formatValue(change.after) }}</pre>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="json-diff-equal"><Check :size="17" /> 两份 JSON 没有差异</div>
    </section>
  </div>
</template>
