<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import JsBarcode from 'jsbarcode'
import { Barcode, Download, Sparkles } from '@lucide/vue'

type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39'

const formats: { value: BarcodeFormat; label: string }[] = [
  { value: 'CODE128', label: 'CODE128' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPC', label: 'UPC-A' },
  { value: 'CODE39', label: 'CODE39' },
]

const content = ref('')
const format = ref<BarcodeFormat>('CODE128')
const showValue = ref(true)
const svgRef = ref<SVGSVGElement | null>(null)
const generated = ref(false)
const error = ref('')
const generating = ref(false)
const formatLabel = computed(() => formats.find((item) => item.value === format.value)?.label ?? format.value)

function clearPreview(): void {
  generated.value = false
  error.value = ''
}

function validateInput(value: string): string {
  if (format.value === 'CODE128' && !/^[\x20-\x7e]+$/.test(value)) return 'CODE128 目前支持英文字母、数字和常见 ASCII 符号。'
  if (format.value === 'EAN13' && !/^\d{12,13}$/.test(value)) return 'EAN-13 请输入 12 位数字，或输入含校验位的 13 位数字。'
  if (format.value === 'EAN8' && !/^\d{7,8}$/.test(value)) return 'EAN-8 请输入 7 位数字，或输入含校验位的 8 位数字。'
  if (format.value === 'UPC' && !/^\d{11,12}$/.test(value)) return 'UPC-A 请输入 11 位数字，或输入含校验位的 12 位数字。'
  if (format.value === 'CODE39' && !/^[0-9A-Z .$/+%-]+$/.test(value)) return 'CODE39 仅支持大写字母、数字、空格和 - . $ / + % 符号。'
  return ''
}

async function generate(): Promise<void> {
  const value = content.value
  if (!value.trim()) {
    error.value = '请先输入条码内容。'
    return
  }
  const validationError = validateInput(value)
  if (validationError) {
    generated.value = false
    error.value = validationError
    return
  }

  error.value = ''
  generated.value = false
  generating.value = true
  await nextTick()
  try {
    generated.value = true
    await nextTick()
    if (!svgRef.value) throw new Error('条码预览区域未就绪。')
    JsBarcode(svgRef.value, value, {
      format: format.value,
      width: 2,
      height: 88,
      displayValue: showValue.value,
      font: 'Arial',
      fontSize: 15,
      textMargin: 5,
      margin: 12,
      lineColor: '#27283a',
      background: '#ffffff',
    })
  } catch {
    generated.value = false
    error.value = '无法生成该条码，请检查内容和校验位后重试。'
  } finally {
    generating.value = false
  }
}

function createSvgBlob(): Blob | null {
  if (!svgRef.value) return null
  const svg = svgRef.value.cloneNode(true) as SVGSVGElement
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function saveSvg(): void {
  const blob = createSvgBlob()
  if (blob) downloadBlob(blob, 'toolbox-barcode.svg')
}

async function savePng(): Promise<void> {
  const svgBlob = createSvgBlob()
  if (!svgBlob || !svgRef.value) return
  const width = Number(svgRef.value.getAttribute('width'))
  const height = Number(svgRef.value.getAttribute('height'))
  if (!width || !height) return

  const image = new Image()
  const imageUrl = URL.createObjectURL(svgBlob)
  image.onload = () => {
    const scale = 3
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) {
      error.value = '无法创建图片，请改为保存 SVG。'
      URL.revokeObjectURL(imageUrl)
      return
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'toolbox-barcode.png')
      else error.value = 'PNG 图片导出失败，请改为保存 SVG。'
      URL.revokeObjectURL(imageUrl)
    }, 'image/png')
  }
  image.onerror = () => {
    error.value = 'PNG 图片导出失败，请改为保存 SVG。'
    URL.revokeObjectURL(imageUrl)
  }
  image.src = imageUrl
}
</script>

<template>
  <div class="barcode-tool-layout">
    <section class="barcode-input-panel">
      <div class="field-heading">
        <label for="barcode-content">条码内容</label>
        <div class="algorithm-select">
          <span>类型</span>
          <select v-model="format" aria-label="条码类型" @change="clearPreview">
            <option v-for="item in formats" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
      </div>
      <input
        id="barcode-content"
        v-model="content"
        class="text-input barcode-text-input"
        :placeholder="format === 'CODE128' ? '例如：Order-2026-001' : '输入对应格式的数字或字符…'"
        @input="clearPreview"
      />
      <label class="barcode-value-toggle"><input v-model="showValue" type="checkbox" @change="clearPreview" /> 在条码下方显示内容</label>
      <div class="barcode-settings-row">
        <p class="form-hint" :class="{ 'hint-error': error }">
          <span v-if="error">{{ error }}</span>
          <span v-else>在本机生成。EAN / UPC 缺少校验位时自动补全；商品编码需使用有效来源。</span>
        </p>
        <button class="primary-button" :disabled="!content.trim() || generating" @click="generate">
          <Sparkles :size="15" /> {{ generating ? '生成中…' : '生成条码' }}
        </button>
      </div>
    </section>
    <section class="barcode-preview-panel">
      <div v-if="generated" class="barcode-preview-card">
        <div class="barcode-image-scroll"><svg ref="svgRef" role="img" :aria-label="`${formatLabel} 条码预览`" /></div>
        <span>{{ formatLabel }} · 条码内容仅在本机处理</span>
        <div class="barcode-export-row">
          <button class="secondary-button" @click="savePng"><Download :size="14" /> 保存 PNG</button>
          <button class="secondary-button" @click="saveSvg"><Download :size="14" /> 保存 SVG</button>
        </div>
      </div>
      <div v-else class="qr-empty-preview">
        <div class="qr-empty-icon"><Barcode :size="28" /></div>
        <strong>条码预览</strong>
        <span>输入内容并选择条码类型</span>
      </div>
    </section>
  </div>
</template>
