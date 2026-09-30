<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRightLeft, Check, Copy, ShieldCheck, Sparkles, X } from '@lucide/vue'
import { copyText } from '../clipboard'
import { formatYaml, jsonToYaml, validateYaml, yamlToJson } from '../yaml'

type Mode = 'yaml' | 'to-json' | 'from-json'
const mode = ref<Mode>('yaml')
const indent = ref(2)
const input = ref('')
const output = ref('')
const error = ref('')
const status = ref('')
const copied = ref(false)
const inputType = computed(() => mode.value === 'from-json' ? 'JSON' : 'YAML')
const outputType = computed(() => mode.value === 'to-json' ? 'JSON' : 'YAML')
let copyTimer: ReturnType<typeof setTimeout> | undefined
let resultRevision = 0

function resetResult(): void {
  resultRevision++
  output.value = ''
  error.value = ''
  status.value = ''
  copied.value = false
  clearTimeout(copyTimer)
}

watch([input, mode, indent], resetResult, { flush: 'sync' })
onBeforeUnmount(() => { resultRevision++; clearTimeout(copyTimer) })

function process(validate = false): void {
  resetResult()
  try {
    if (validate) {
      validateYaml(input.value)
      status.value = 'YAML 1.2 校验通过，可安全转换为 JSON。'
      return
    }
    output.value = mode.value === 'from-json' ? jsonToYaml(input.value, indent.value)
      : mode.value === 'to-json' ? yamlToJson(input.value, indent.value) : formatYaml(input.value, indent.value)
    status.value = mode.value === 'yaml' ? '格式化完成，保留注释和锚点。' : '转换完成，所有处理均在本机进行。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '处理失败，请检查输入内容。'
  }
}

async function copyOutput(): Promise<void> {
  const value = output.value
  const revision = resultRevision
  if (!value) return
  try {
    await copyText(value)
    if (revision !== resultRevision) return
    error.value = ''
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1600)
  } catch {
    if (revision === resultRevision) error.value = '复制失败，请检查剪贴板权限。'
  }
}

function clearAll(): void {
  input.value = ''
  resetResult()
}
</script>

<template>
  <div class="tool-form">
    <div class="yaml-toolbar">
      <div class="mode-switch" aria-label="YAML 处理方式">
        <button :class="{ selected: mode === 'yaml' }" :aria-pressed="mode === 'yaml'" @click="mode = 'yaml'">格式化 / 校验</button>
        <button :class="{ selected: mode === 'to-json' }" :aria-pressed="mode === 'to-json'" @click="mode = 'to-json'">
          YAML → JSON
        </button>
        <button :class="{ selected: mode === 'from-json' }" :aria-pressed="mode === 'from-json'" @click="mode = 'from-json'">
          JSON → YAML
        </button>
      </div>
      <label class="yaml-indent" for="yaml-indent">缩进
        <select id="yaml-indent" v-model.number="indent"><option :value="2">2 空格</option><option :value="4">4 空格</option></select>
      </label>
    </div>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading">
          <label for="yaml-input">输入 {{ inputType }}</label>
          <button class="quiet-button" :disabled="!input && !output" @click="clearAll"><X :size="14" /> 清空</button>
        </div>
        <textarea id="yaml-input" v-model="input" class="code-input" spellcheck="false"
          :placeholder="`在此粘贴 ${inputType}，最多 1 MiB…`"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading">
          <label for="yaml-output">{{ outputType }} 结果</label>
          <button class="quiet-button" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <textarea id="yaml-output" :value="output" class="code-input result-input" readonly spellcheck="false"
          placeholder="处理结果会显示在这里"></textarea>
      </section>
    </div>
    <p class="form-hint yaml-limits">
      仅支持可无损转为 JSON 的单文档 YAML 1.2：字符串键、有限安全数字、数组和对象等。
      最大 80 层、100 次别名展开。
      <span v-if="mode === 'to-json'">转为 JSON 会移除注释并展开锚点；不保留原始排版。</span>
      <span v-else>不支持合并键、自定义标签或重复键；需要保留精度的数字请加引号。</span>
    </p>
    <div class="tool-action-row">
      <p class="form-hint yaml-status" :class="{ 'hint-error': error }" aria-live="polite" :role="error ? 'alert' : 'status'">
        <span v-if="error">{{ error }}</span>
        <span v-else-if="status"><Check :size="14" /> {{ status }}</span>
        <span v-else>输入和结果不会上传或自动保存。</span>
      </p>
      <div class="action-buttons">
        <button v-if="mode === 'yaml'" class="secondary-button" :disabled="!input.trim()" @click="process(true)">
          <ShieldCheck :size="15" /> 校验
        </button>
        <button class="primary-button" :disabled="!input.trim()" @click="process()">
          <Sparkles v-if="mode === 'yaml'" :size="15" /><ArrowRightLeft v-else :size="15" />
          {{ mode === 'yaml' ? '格式化' : `转为 ${outputType}` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.yaml-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; }
.yaml-toolbar .mode-switch { flex-wrap: wrap; margin-bottom: 0; }
.yaml-indent { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--muted); }
.yaml-indent select { padding: 6px 9px; border: 1px solid var(--line); border-radius: 6px; color: inherit; background: var(--surface); }
.yaml-limits { display: block; line-height: 1.7; }
.yaml-limits span { display: block; }
.yaml-status { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
