<script setup lang="ts">
import type { ImageOutput } from '../imageProcessing'
defineProps<{ outputs: ImageOutput[] | null; index: number; preview: string; saving: boolean; busy: boolean }>()
defineEmits<{ 'update:index': [number]; save: [] }>()
</script>
<template>
  <section v-if="outputs?.length" class="tool-form">
    <label>结果 <select :value="index" :disabled="saving" @change="$emit('update:index', Number(($event.target as HTMLSelectElement).value))">
      <option v-for="(output, i) in outputs" :key="i" :value="i">{{ i + 1 }}. {{ output.name }} · {{ output.width }} × {{ output.height }}</option>
    </select></label>
    <p class="form-hint">{{ outputs[index].sourceWidth }} × {{ outputs[index].sourceHeight }} → {{ outputs[index].width }} × {{ outputs[index].height }} · {{ outputs[index].bytes.length.toLocaleString() }} 字节</p>
    <div class="image-format-preview-frame"><img v-if="preview" :src="preview" alt="编辑结果预览" /></div>
    <button class="primary-button" :disabled="saving || busy" @click="$emit('save')">{{ saving ? '保存中…' : '另存当前图片为新 PNG' }}</button>
  </section>
  <p class="form-hint">仅处理静态 PNG / JPEG，先按 EXIF 方向校正。PNG 输出为 WebView Canvas 的 8 位颜色处理结果；不保证色彩配置、HDR 或高位深保真，不复制原 EXIF / GPS / 文本元数据；并非经审计的隐私清除器。透明区域保留。</p>
  <p class="form-hint">单张输入/输出 16 MiB，整批各 32 MiB，边长 8192、1600 万像素；最多 8 张，顺序处理、30 秒超时，可取消。只展示当前结果以控制内存；浏览器实际内存由解码器管理。</p>
  <p class="form-hint">Windows 桌面版另存，复用安全新建输出，拒绝覆盖和重解析路径。逐张另存；保存提交后不能撤回，离页可能继续完成，失败尽力清理未完成文件。输入和结果不上传、不自动保存。</p>
</template>
