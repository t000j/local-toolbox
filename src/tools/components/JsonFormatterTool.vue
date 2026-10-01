<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Minimize2, Sparkles, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { useWorkerTask } from '../useWorkerTask'

const input = ref('{\n  "name": "LocalToolbox",\n  "ready": true,\n  "tools": ["JSON", "Base64", "Hash"]\n}')
const copied = ref(false)
const { result: output, error, busy, reset, cancel, run } = useWorkerTask<{ input: string; compact: boolean }, string>(
  () => new Worker(new URL('../jsonFormat.worker.ts', import.meta.url), { type: 'module' }),
)
let revision = 0
let copyTimer: ReturnType<typeof setTimeout> | undefined
function invalidate(): void { revision++; reset(); copied.value = false; clearTimeout(copyTimer) }
watch(input, invalidate, { flush: 'sync' })
function formatJson(compact = false): void {
  invalidate()
  if (input.value.length > 1024 * 1024) { error.value = 'JSON 输入超过 1 MiB 上限。'; return }
  run({ input: input.value, compact })
}
async function copyOutput(): Promise<void> {
  if (!output.value) return
  const version = revision
  try {
    await copyText(output.value)
    if (version !== revision) return
    copied.value = true
    copyTimer = setTimeout(() => { copied.value = false }, 1600)
  } catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
function clearAll(): void { input.value = ''; invalidate() }
onBeforeUnmount(() => { revision++; clearTimeout(copyTimer) })
</script>

<template>
  <div class="tool-form">
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading">
          <label for="json-input">输入 JSON</label>
          <button class="quiet-button" :disabled="!input" @click="clearAll"><X :size="14" /> 清空</button>
        </div>
        <textarea id="json-input" v-model="input" class="code-input" spellcheck="false" placeholder="在此粘贴 JSON…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading">
          <label>处理结果</label>
          <button class="quiet-button" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea :value="output ?? ''" class="code-input result-input" readonly spellcheck="false" placeholder="格式化结果会显示在这里"></textarea>
      </section>
    </div>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error">{{ error }}</span>
        <span v-else-if="output"><Check :size="14" /> JSON 校验通过，处理在本机完成</span>
        <span v-else-if="busy">正在本机处理…</span>
        <span v-else>每份最多 1 MiB / 50,000 节点 / 128 层，3 秒超时；拒绝重复键、负零和不能无损转换的数字。</span>
      </p>
      <div class="action-buttons">
        <button v-if="busy" class="secondary-button" @click="cancel">取消</button>
        <button class="secondary-button" :disabled="!input || busy" @click="formatJson(true)"><Minimize2 :size="15" /> 压缩</button>
        <button class="primary-button" :disabled="!input || busy" @click="formatJson(false)"><Sparkles :size="15" /> 格式化</button>
      </div>
    </div>
  </div>
</template>
