<script setup lang="ts">
import { shallowRef } from 'vue'
import { useWorkerTask } from '../useWorkerTask'
import type { PdfMetadataResult } from '../pdfMetadata'
const file = shallowRef<File | null>(null)
const { result, error, busy, cancel, reset, run } = useWorkerTask<File, PdfMetadataResult>(() => new Worker(new URL('../pdfMetadata.worker.ts', import.meta.url), { type: 'module' }), 20_000)
function choose(event: Event) {
  const input = event.target as HTMLInputElement; file.value = input.files?.[0] ?? null; input.value = ''; reset()
  if (file.value) run(file.value)
}
function clear() { file.value = null; reset() }
</script>
<template>
  <div class="tool-form">
    <label>选择PDF（最多8MiB）<input type="file" accept=".pdf" @change="choose" /></label>
    <div class="action-buttons"><button v-if="busy" class="secondary-button" @click="cancel">取消</button><button class="secondary-button" @click="clear">清空</button></div>
    <p class="form-hint" role="status">{{ error || (busy ? '本机只读文档属性…' : '') }}</p>
    <template v-if="result">
      <p class="form-hint">{{ file?.name }} · {{ result.version }} · {{ result.bytes.toLocaleString() }}字节 · {{ result.pages.length }}页</p>
      <dl class="metadata-grid"><template v-for="(field, i) in result.fields" :key="i"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></template></dl>
      <p v-if="!result.fields.length" class="form-hint">未发现Info标量属性；不能据此判断文件已脱敏。</p>
      <details><summary>页面尺寸和旋转（PDF点，72点=1英寸；未乘UserUnit）</summary><ul><li v-for="page in result.pages" :key="page.number">第{{ page.number }}页：CropBox {{ page.width }} × {{ page.height }}，旋转{{ page.rotation }}°</li></ul></details>
      <p class="form-hint">{{ result.xmpStatus }}</p>
      <textarea v-if="result.xmp" :value="result.xmp" readonly rows="12" aria-label="原始Metadata文本" spellcheck="false" />
    </template>
    <p class="form-hint">部分实现：标题/作者/主题/关键词/创建工具/日期等Info原始声明，以及Catalog的UTF-8原始Metadata文本；日期不转换时区或验证真实性。属性由文件作者填写，可能伪造或含隐私，和实际内容不一致；未显示不代表不存在。Info非标量只提示不展开；不遍历页面/图片/附件等内部元数据，不做脱敏。</p>
    <p class="form-hint">只读本机处理，不解码页面图片、不上传/修改/保存，不执行XML/脚本或加载实体/链接；字段纯文本显示，控制/双向格式字符转义。沿用静态PDF准入，加密、交互/链接/表单/签名、混合/增量xref等拒绝，并非通用属性检查器。</p>
    <p class="form-hint">输入8MiB/200页/6000对象，20秒可终止Worker；Info最多64字段/单字段65536字符/总256Ki字符，Metadata仅原始或单层Flate、编码/展开各256KiB。取消/换文件/离页终止。Windows WebView界面未验证。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } .form-hint, li { overflow-wrap: anywhere; } input, textarea { max-width: 100%; } textarea { width: 100%; }
.metadata-grid { display: grid; grid-template-columns: minmax(90px, 150px) minmax(0, 1fr); gap: 8px 16px; font-size: 12px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
