<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Braces, Check, CircleAlert, Copy, Minus, Plus, RefreshCw } from '@lucide/vue'
import { copyText } from '../clipboard'
import type { JsonChange } from '../safeJson'
import { useWorkerTask } from '../useWorkerTask'
const leftText = ref(''), rightText = ref(''), copied = ref(false), page = ref(1)
const { result: changes, error, busy, reset, cancel, run } = useWorkerTask<{ left: string; right: string }, JsonChange[]>(
  () => new Worker(new URL('../jsonDiff.worker.ts', import.meta.url), { type: 'module' }),
)
const addedCount = computed(() => changes.value?.filter(change => change.type === 'added').length ?? 0)
const removedCount = computed(() => changes.value?.filter(change => change.type === 'removed').length ?? 0)
const changedCount = computed(() => changes.value?.filter(change => change.type === 'changed').length ?? 0)
const pages = computed(() => Math.max(1, Math.ceil((changes.value?.length ?? 0) / 50)))
const visibleChanges = computed(() => changes.value?.slice((page.value - 1) * 50, page.value * 50) ?? [])
let revision = 0
function resetResult(): void { revision++; reset(); copied.value = false; page.value = 1 }
watch([leftText, rightText], resetResult, { flush: 'sync' })
function compare(): void {
  resetResult()
  if (leftText.value.length > 1024 * 1024 || rightText.value.length > 1024 * 1024) { error.value = '每侧 JSON 输入不能超过 1 MiB。'; return }
  run({ left: leftText.value, right: rightText.value })
}
function clearAll(): void { leftText.value = ''; rightText.value = ''; resetResult() }
async function copyChanges(): Promise<void> {
  if (!changes.value) return
  const version = revision
  const text = changes.value.length ? changes.value.map(change => `${change.type === 'added' ? '新增' : change.type === 'removed' ? '删除' : '修改'} ${change.path}\n原值：${change.before ?? '（不存在）'}\n新值：${change.after ?? '（不存在）'}`).join('\n\n') : '两份 JSON 内容一致'
  try { await copyText(text); if (version === revision) copied.value = true }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <div class="json-diff-tool">
    <div class="json-diff-input-grid">
      <section class="json-diff-panel">
        <div class="field-heading">
          <label for="json-diff-left">原始 JSON</label>
          <button class="quiet-button" :disabled="!leftText && !rightText" @click="clearAll"><RefreshCw :size="13" /> 清空</button>
        </div>
        <textarea id="json-diff-left" v-model="leftText" class="code-input json-diff-textarea" spellcheck="false" placeholder="粘贴原始 JSON…"></textarea>
      </section>
      <section class="json-diff-panel">
        <div class="field-heading"><label for="json-diff-right">对比 JSON</label></div>
        <textarea id="json-diff-right" v-model="rightText" class="code-input json-diff-textarea" spellcheck="false" placeholder="粘贴要比较的 JSON…"></textarea>
      </section>
    </div>

    <div class="json-diff-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error"><CircleAlert :size="14" /> {{ error }}</span>
        <span v-else-if="busy">正在本机比较…</span>
        <span v-else>每侧最多 1 MiB / 50,000 节点 / 128 层；忽略对象键顺序，数组按索引比较；拒绝重复键和有损数字。</span>
      </p>
      <button v-if="busy" class="secondary-button" @click="cancel">取消比较</button>
      <button v-else class="primary-button" :disabled="!leftText.trim() || !rightText.trim()" @click="compare"><Braces :size="15" /> 比较差异</button>
    </div>

    <section v-if="changes !== null" class="json-diff-results">
      <div class="json-diff-results-heading">
        <div><h2>比较结果</h2><span>{{ changes.length ? `共发现 ${changes.length} 处差异` : '两份 JSON 内容一致' }}</span></div>
        <button class="quiet-button" @click="copyChanges"><Copy :size="14" /> {{ copied ? '已复制' : '复制全部差异' }}</button>
        <div class="json-diff-counts">
          <span class="diff-count-added"><Plus :size="12" /> {{ addedCount }} 新增</span>
          <span class="diff-count-removed"><Minus :size="12" /> {{ removedCount }} 删除</span>
          <span class="diff-count-changed"><ArrowRight :size="12" /> {{ changedCount }} 修改</span>
        </div>
      </div>
      <div v-if="changes.length" class="json-diff-change-list">
        <article v-for="(change, index) in visibleChanges" :key="`${change.path}-${change.type}-${index}`" class="json-diff-change" :class="`change-${change.type}`">
          <div class="json-diff-change-heading">
            <span class="json-diff-kind">{{ change.type === 'added' ? '新增' : change.type === 'removed' ? '删除' : '修改' }}</span>
            <code>{{ change.path }}</code>
          </div>
          <div class="json-diff-values" :class="`diff-values-${change.type}`">
            <div v-if="change.type !== 'added'" class="json-diff-value">
              <span>原值</span><pre>{{ change.before }}</pre>
            </div>
            <div v-if="change.type !== 'removed'" class="json-diff-value">
              <span>新值</span><pre>{{ change.after }}</pre>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="json-diff-equal"><Check :size="17" /> 两份 JSON 没有差异</div>
      <div v-if="pages > 1" class="tool-action-row">
        <button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}（每页 50 处）</span>
        <button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button>
      </div>
      <p class="form-hint">最多 1000 处差异 / 2 MiB 结果，3 秒超时；超限会明确失败，不把部分结果称为全部。</p>
    </section>
  </div>
</template>
