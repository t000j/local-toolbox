<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Copy } from '@lucide/vue'
import { copyText } from '../clipboard'
import { decodeJwt, type JwtContent } from '../jwt'

const input = ref(''), result = ref<JwtContent | null>(null), error = ref('')
const copied = ref<keyof JwtContent | null>(null)
let revision = 0
function invalidate(): void { revision++; result.value = null; error.value = ''; copied.value = null }
watch(input, invalidate, { flush: 'sync' })
function decode(): void {
  invalidate()
  try { result.value = decodeJwt(input.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '解码失败。' }
}
async function copy(part: keyof JwtContent): Promise<void> {
  if (!result.value) return
  const version = revision
  try { await copyText(result.value[part]); if (version === revision) copied.value = part }
  catch { if (version === revision) error.value = '复制失败，请检查剪贴板权限。' }
}
onBeforeUnmount(() => { revision++ })
</script>

<template>
  <div class="tool-form">
    <p class="form-hint">仅解码，不验证签名。所有字段均未经验证，不能用于身份认证、授权或判断令牌可信性。</p>
    <div class="field-heading"><label for="jwt-input">JWT（header.payload.signature）</label></div>
    <textarea id="jwt-input" v-model="input" class="code-input" spellcheck="false" autocomplete="off" autocapitalize="off"
      placeholder="粘贴三段式 JWT，不含 Bearer 前缀或空白…" @keydown.ctrl.enter.prevent="decode"></textarea>
    <div class="workbench-grid">
      <section class="editor-column">
        <div class="field-heading"><label for="jwt-header">Header（未经验证）</label>
          <button class="quiet-button" :disabled="result === null" @click="copy('header')">
            <Copy :size="14" /> {{ copied === 'header' ? '已复制' : '复制 Header' }}
          </button>
        </div>
        <textarea id="jwt-header" :value="result?.header ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="解码后的原始 JSON 文本…"></textarea>
      </section>
      <section class="editor-column">
        <div class="field-heading"><label for="jwt-payload">Payload（未经验证）</label>
          <button class="quiet-button" :disabled="result === null" @click="copy('payload')">
            <Copy :size="14" /> {{ copied === 'payload' ? '已复制' : '复制 Payload' }}
          </button>
        </div>
        <textarea id="jwt-payload" :value="result?.payload ?? ''" class="code-input result-input" readonly spellcheck="false"
          placeholder="解码后的原始 JSON 文本…"></textarea>
      </section>
    </div>
    <p class="form-hint">本机处理，不联网、不保存令牌；仅点击复制时写入剪贴板。保留原始 JSON，避免改写数字或重复键。</p>
    <div class="tool-action-row">
      <p class="form-hint" :class="{ 'hint-error': error }" aria-live="polite">
        {{ error || (result ? '内容已解码；签名、算法及声明均未验证。' : '最多 100,000 字符；不支持 JWE。Ctrl+Enter 解码。') }}
      </p>
      <button class="primary-button" @click="decode">解码内容</button>
    </div>
  </div>
</template>
