<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import { Download, QrCode, Sparkles } from '@lucide/vue'

const content = ref('')
const correction = ref<'L' | 'M' | 'Q' | 'H'>('M')
const dataUrl = ref('')
const svgMarkup = ref('')
const error = ref('')
const generating = ref(false)

async function generate(): Promise<void> {
  if (!content.value.trim()) return
  error.value = ''
  generating.value = true
  try {
    const options = {
      errorCorrectionLevel: correction.value,
      margin: 2,
      width: 320,
      color: { dark: '#27283a', light: '#ffffff' },
    }
    const [png, svg] = await Promise.all([
      QRCode.toDataURL(content.value, options),
      QRCode.toString(content.value, { ...options, type: 'svg' }),
    ])
    dataUrl.value = png
    svgMarkup.value = svg
  } catch (cause) {
    dataUrl.value = ''
    svgMarkup.value = ''
    error.value = cause instanceof Error ? cause.message : '二维码生成失败，请缩短内容后重试。'
  } finally {
    generating.value = false
  }
}

function saveImage(): void {
  if (!dataUrl.value) return
  const link = document.createElement('a')
  link.href = dataUrl.value
  link.download = 'toolbox-qr.png'
  link.click()
}

function saveSvg(): void {
  if (!svgMarkup.value) return
  const url = URL.createObjectURL(new Blob([svgMarkup.value], { type: 'image/svg+xml;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'toolbox-qr.svg'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="qr-tool-layout">
    <section class="qr-input-panel">
      <div class="field-heading"><label for="qr-content">二维码内容</label><span class="field-suffix">文字或链接</span></div>
      <textarea id="qr-content" v-model="content" class="code-input qr-input" placeholder="输入要生成二维码的内容…" @input="error = ''; dataUrl = ''; svgMarkup = ''"></textarea>
      <div class="qr-settings-row">
        <div class="algorithm-select">
          <span>容错等级</span>
          <select v-model="correction" @change="dataUrl = ''; svgMarkup = ''">
            <option value="L">低</option><option value="M">中</option><option value="Q">较高</option><option value="H">高</option>
          </select>
        </div>
        <button class="primary-button" :disabled="!content.trim() || generating" @click="generate">
          <Sparkles :size="15" /> {{ generating ? '生成中…' : '生成二维码' }}
        </button>
      </div>
      <p v-if="error" class="inline-error">{{ error }}</p>
      <p v-else class="form-hint">二维码由应用在本机生成，内容不会发送到网络。</p>
    </section>
    <section class="qr-preview-panel">
      <div v-if="dataUrl" class="qr-preview-card">
        <img :src="dataUrl" alt="生成的二维码" />
        <span>扫码查看内容</span>
        <div class="qr-export-row">
          <button class="secondary-button" @click="saveImage"><Download :size="15" /> 保存 PNG</button>
          <button class="secondary-button" @click="saveSvg"><Download :size="15" /> 保存 SVG</button>
        </div>
      </div>
      <div v-else class="qr-empty-preview">
        <div class="qr-empty-icon"><QrCode :size="28" /></div>
        <strong>二维码预览</strong>
        <span>输入内容后即可生成</span>
      </div>
    </section>
  </div>
</template>
