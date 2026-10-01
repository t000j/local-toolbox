<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { copyText } from '../clipboard'
import { formatColor, parseColor } from '../colorFormats'
const input = ref('#33669980'), result = shallowRef<ReturnType<typeof formatColor> | null>(null), error = ref(''), copied = ref(''), copying = ref(false)
let revision = 0, disposed = false
function invalidate() { revision++; result.value = null; error.value = ''; copied.value = '' }
watch(input, invalidate, { flush: 'sync' })
function convert() { invalidate(); try { result.value = formatColor(parseColor(input.value)) } catch (cause) { error.value = cause instanceof Error ? cause.message : '颜色转换失败。' } }
async function copy(key: keyof ReturnType<typeof formatColor>) {
  if (!result.value || copying.value || disposed) return
  const version = revision; copying.value = true
  try { await copyText(result.value[key]); if (!disposed && version === revision) copied.value = key }
  catch { if (!disposed && version === revision) error.value = '复制失败，请检查剪贴板权限。' }
  finally { if (!disposed) copying.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <label for="color-input">颜色（最多 256 字符）</label>
    <input id="color-input" v-model="input" class="text-input" maxlength="256" spellcheck="false" @keydown.enter="convert" />
    <div class="action-buttons"><button class="primary-button" @click="convert">转换</button><button class="secondary-button" @click="input = ''; invalidate()">清空</button></div>
    <p class="form-hint">支持 #RGB / #RGBA / #RRGGBB / #RRGGBBAA；rgb(a) 与 hsl(a) 的逗号格式或空格 / 透明度格式。例如 rgb(255 0 128 / 50%)、hsl(0.5turn 100% 50%)。</p>
    <p class="form-hint">RGB 通道统一用 0–255 数值或 0–100%；HSL 饱和度和亮度必须带 %，色相支持 deg/rad/grad/turn 或无单位角度（输入绝对值最多 10 亿，正负循环）。透明度 0–1 或百分比；超范围拒绝，不静默夹取。</p>
    <template v-if="result">
      <div class="checker"><div class="swatch" :style="{ backgroundColor: result.rgb }" aria-label="颜色与透明度预览" /></div>
      <div v-for="key in (['hex', 'hex8', 'rgb', 'hsl'] as const)" :key="key" class="color-line">
        <label :for="'color-' + key">{{ key.toUpperCase() }}</label><input :id="'color-' + key" :value="result[key]" class="text-input" readonly spellcheck="false" />
        <button class="secondary-button" :disabled="copying" @click="copy(key)">{{ copied === key ? '已复制' : '复制' }}</button>
      </div>
    </template>
    <p class="form-hint" role="status">{{ error }}</p>
    <p class="form-hint">按 sRGB 数值模型转换，不做 ICC/显示校准或 CMYK/Lab/广色域转换；不支持颜色名、currentColor、CSS 变量或表达式。RGB/HSL 输出保留最多 6 位小数，HEX 每通道及透明度量化到 8 位，可能有舍入差异；完全透明时仍保留 RGB 通道。</p>
    <p class="form-hint">全部本机计算，不联网或保存；只在显式复制时写入剪贴板。预览使用规范化结果，不将输入当作 CSS 执行。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint { overflow-wrap: anywhere; }
.color-line { display: grid; grid-template-columns: 45px minmax(0, 1fr) auto; align-items: center; gap: 8px; font-size: 12px; }
.checker { width: 160px; background: conic-gradient(#ddd 25%, white 0 50%, #ddd 0 75%, white 0) 0 0 / 16px 16px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; } .swatch { height: 70px; }
</style>
