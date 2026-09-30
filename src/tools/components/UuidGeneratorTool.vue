<script setup lang="ts">
import { computed, ref } from 'vue'
import { Binary, Check, Copy, RefreshCw, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'

const count = ref(1)
const uuids = ref<string[]>([])
const error = ref('')
const copied = ref(false)
const output = computed(() => uuids.value.join('\n'))

function generate(): void {
  error.value = ''
  copied.value = false
  if (!Number.isInteger(count.value) || count.value < 1 || count.value > 100) {
    error.value = '请输入 1 到 100 之间的整数。'
    return
  }

  try {
    const bytes = crypto.getRandomValues(new Uint8Array(count.value * 16))
    const result: string[] = []
    for (let index = 0; index < count.value; index++) {
      const uuidBytes = Array.from(bytes.slice(index * 16, (index + 1) * 16))
      uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40
      uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80
      const hex = uuidBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
      result.push(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`)
    }
    uuids.value = result
  } catch {
    uuids.value = []
    error.value = '当前运行环境无法获取安全随机数。'
  }
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  error.value = ''
  try {
    await copyText(output.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="uuid-tool">
    <section class="uuid-settings-card">
      <div class="uuid-settings-copy">
        <div class="uuid-icon"><Binary :size="18" /></div>
        <div><strong>UUID v4</strong><span>随机生成，适用于测试数据和本地标识</span></div>
      </div>
      <div class="uuid-controls">
        <label for="uuid-count">生成数量</label>
        <input id="uuid-count" v-model.number="count" type="number" min="1" max="100" aria-label="UUID 生成数量" />
        <button class="primary-button" @click="generate"><Sparkles :size="15" /> 生成 UUID</button>
      </div>
    </section>

    <section class="uuid-result-panel">
      <div class="field-heading">
        <label for="uuid-output">生成结果</label>
        <div class="uuid-result-actions">
          <span>{{ uuids.length }} 个</span>
          <button class="quiet-button" :disabled="!output" @click="copyOutput"><Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制全部' }}</button>
        </div>
      </div>
      <textarea id="uuid-output" class="code-input uuid-output" :value="output" readonly spellcheck="false" placeholder="点击“生成 UUID”创建随机标识…"></textarea>
      <p class="form-hint" :class="{ 'hint-error': error }">
        <span v-if="error">{{ error }}</span>
        <span v-else><RefreshCw :size="13" /> 每次点击都会重新生成；随机数仅在本机创建。</span>
      </p>
    </section>
  </div>
</template>
