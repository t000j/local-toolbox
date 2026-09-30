<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { usePdfPageEditor } from '../usePdfPageEditor'
const PdfPageThumbnails = defineAsyncComponent(() => import('./PdfPageThumbnails.vue'))
const props = defineProps<{ mode: 'split' | 'order' | 'rotate' }>()
const { file, pages, order, rotations, selection, acknowledged, saving, notice, inspection, output, choose, inspect, generate, move, rotate, saveOutput, clear } = usePdfPageEditor(props.mode)
const { busy: inspecting, error: inspectionError } = inspection
const { busy: generating, error, result, cancel } = output
const busy = computed(() => inspecting.value || generating.value)
</script>
<template>
  <div class="tool-form">
    <label>选择PDF（最多8MiB）<input type="file" accept=".pdf" :disabled="saving || busy" @change="choose" /></label>
    <p v-if="file" class="form-hint">{{ file.name }} · {{ file.size.toLocaleString() }} 字节</p>
    <div class="action-buttons"><button class="primary-button" :disabled="!file || saving || busy" @click="inspect">读取并校验页面</button><button v-if="inspecting" class="secondary-button" @click="inspection.cancel">取消读取</button><button v-if="generating" class="secondary-button" @click="cancel">取消导出</button><button class="secondary-button" :disabled="saving" @click="file = null; clear()">清空</button></div>
    <template v-if="pages.length">
      <p class="form-hint">原文档 {{ pages.length }} 页；以下尺寸为CropBox的PDF用户单位，旋转为读取时的页面角度。</p>
      <template v-if="mode === 'split'">
        <label>导出的页码/范围<input v-model="selection" :disabled="saving || busy" maxlength="2000" placeholder="1-3,5,8-10" /></label>
        <p class="form-hint">英文逗号分隔，单个范围须升序；按填写顺序导出为一份新PDF。重叠/重复/越界拒绝；未选页不会进入输出，可再次选择范围另存其他部分。</p>
      </template>
      <PdfPageThumbnails v-if="mode === 'order' && file" :file="file" :pages="pages" :order="order" :disabled="busy || saving" @move="move" />
      <ol v-else class="page-list"><li v-for="(number, index) in order" :key="number">
        <span>原第 {{ number }} 页 · {{ pages[number - 1]?.width }} × {{ pages[number - 1]?.height }} · {{ pages[number - 1]?.rotation }}°</span>
        <template v-if="mode === 'order'"><button class="secondary-button" :disabled="index === 0 || busy || saving" :aria-label="'上移原第' + number + '页'" @click="move(index, -1)">↑</button><button class="secondary-button" :disabled="index === order.length - 1 || busy || saving" :aria-label="'下移原第' + number + '页'" @click="move(index, 1)">↓</button></template>
        <label v-if="mode === 'rotate'">追加顺时针旋转<select :value="rotations[index]" :disabled="busy || saving" @change="rotate(index, Number(($event.target as HTMLSelectElement).value))"><option :value="0">不变</option><option :value="90">90°</option><option :value="180">180°</option><option :value="270">270°</option></select></label>
      </li></ol>
      <button class="primary-button" :disabled="busy || saving" @click="generate">生成并重读校验</button>
    </template>
    <template v-if="result">
      <p class="form-hint">输出 {{ result.pages.length }} 页 · {{ result.bytes.length.toLocaleString() }} 字节 · 原始页码顺序：{{ result.order.join(', ') }}</p>
      <label><input v-model="acknowledged" type="checkbox" :disabled="saving" />已确认页码/顺序/旋转并理解以下兼容范围</label>
      <button class="primary-button" :disabled="!acknowledged || saving" @click="saveOutput">{{ saving ? '保存中…' : '另存新PDF（不覆盖）' }}</button>
    </template>
    <p class="form-hint" role="status">{{ error || inspectionError || notice || (busy ? '正在本机处理并校验…' : '') }}</p>
    <p class="form-hint">当前部分实现：支持PDF1.0–1.7经典xref及有界单次保存ObjStm/XRef；拒绝混合/增量xref、间接流长度、加密、表单/签名/注释/链接/动作/脚本/附件/外部引用/目录/分层/标签等结构。不会绕过保护或静默扁平化；不是恶意PDF清洗器，只处理可信来源。此页不嵌入外部阅读器。</p>
    <p class="form-hint">最多200页/输入8MiB/输出16MiB，每次Worker任务30秒；取消/清空/离页终止。保留所选页原内容/资源/框和原角度（旋转操作除外），不保留文档级元数据/身份，页面内容仍可能含隐私。新建保存拒绝覆盖，提交保存后不能撤回。Windows实际界面与原生保存尚未验证。</p>
  </div>
</template>
<style scoped>
.action-buttons { flex-wrap: wrap; } label, li { font-size: 12px; } input { max-width: 100%; } .form-hint { overflow-wrap: anywhere; } .page-list { padding-left: 20px; max-height: 380px; overflow: auto; } .page-list li { margin: 6px 0; } .page-list span { margin-right: 8px; overflow-wrap: anywhere; }
</style>
