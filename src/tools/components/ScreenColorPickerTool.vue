<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { copyText } from '../clipboard'
import { useScreenColorPicker } from '../useScreenColorPicker'
const { color, busy, error, notice, supported, pick, cancel, clear } = useScreenColorPicker()
const copied = ref(false), copying = ref(false)
let revision = 0, disposed = false
watch(color, () => { revision++; copied.value = false }, { flush: 'sync' })
async function copy() {
  if (!color.value || copying.value || busy.value || disposed) return
  const version = revision; copying.value = true
  try { await copyText(color.value); if (!disposed && revision === version) copied.value = true }
  catch { if (!disposed && revision === version) error.value = '复制失败，请检查剪贴板权限。' }
  finally { if (!disposed) copying.value = false }
}
onBeforeUnmount(() => { disposed = true; revision++ })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">点击开始后，使用运行环境提供的放大取色光标，在屏幕上单击目标像素；按 Esc 或取消退出。30 秒自动停止。只在你点选后返回一个色值，本工具不接收或保存屏幕图像，不后台采样。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || !supported" @click="pick">开始取色</button>
      <button class="secondary-button" :disabled="!busy" @click="cancel">取消取色</button><button class="secondary-button" @click="clear">清空</button></div>
    <p v-if="!supported" class="form-hint hint-error">当前环境未提供 EyeDropper API 或安全上下文，屏幕取色不可用；不会自动申请屏幕录制或后台截屏。</p>
    <div v-if="color" class="color-result"><span class="color-swatch" :style="{ backgroundColor: color }" aria-label="所选颜色预览" />
      <output>{{ color }}</output><button class="secondary-button" :disabled="copying" @click="copy">{{ copied ? '已复制' : '复制 HEX' }}</button></div>
    <p class="form-hint" role="status">{{ error || notice || (busy ? '正在等待你选择像素；Esc 可取消…' : '') }}</p>
    <p class="form-hint">输出是 #RRGGBB sRGB，不包含透明度或屏幕坐标。跨显示器、负坐标及不同 DPI 的选点由原生浏览器取色器负责，本工具不按 CSS 坐标换算。当前 WebView 是否支持、多屏与缩放实际表现仍需 Windows 验证；HDR/广色域或显示色彩配置可能改变观感，不用于校色测量。</p>
    <p class="form-hint">仅驻留当前页面；开始新选择、清空或离页丢弃色值。只有显式点击复制才写入剪贴板，不联网、不自动保存。</p>
  </div>
</template>
<style scoped>
.color-result { display: flex; align-items: center; gap: 16px; } .color-swatch { width: 80px; height: 64px; border: 1px solid var(--border-color); border-radius: 8px; } output { font-family: monospace; font-size: 20px; }
</style>
