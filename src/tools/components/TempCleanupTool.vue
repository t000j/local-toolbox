<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import NativeToolFrame from './NativeToolFrame.vue'
import { formatBytes, formatDate, useNativeTask } from '../nativeTools'
interface CleanupFile { id: number; path: string; bytes: number; modifiedAt: number }
interface Preview { token: string; root: string; files: CleanupFile[]; totalBytes: number; skippedCount: number; truncated: boolean }
interface Result { deletedCount: number; deletedBytes: number; failures: { path: string; reason: string }[] }
const { busy, error, message, run } = useNativeTask()
const preview = ref<Preview | null>(null)
const selected = ref<number[]>([])
const result = ref<Result | null>(null)
const confirming = ref(false)
const page = ref(1)
const visible = computed(() => preview.value?.files.slice((page.value - 1) * 50, page.value * 50) ?? [])
const pages = computed(() => Math.max(1, Math.ceil((preview.value?.files.length ?? 0) / 50)))
const selectedBytes = computed(() => preview.value?.files.filter((file) => selected.value.includes(file.id)).reduce((sum, file) => sum + file.bytes, 0) ?? 0)
async function scan() {
  selected.value = []; confirming.value = false; result.value = null; preview.value = null; page.value = 1
  const value = await run(() => invoke<Preview>('preview_temp_cleanup')); if (value) preview.value = value
}
async function clean() {
  if (!preview.value) return
  const token = preview.value.token
  const ids = [...selected.value]
  const value = await run(() => invoke<Result>('execute_temp_cleanup', { token, ids }))
  preview.value = null; selected.value = []; confirming.value = false
  if (value) result.value = value
}
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="仅预览当前用户临时目录中超过 7 天的普通文件，最多 2000 项；默认不选择任何文件，删除不进入回收站。">
    <template #toolbar><button class="primary-button" :disabled="busy" @click="scan">扫描并预览</button><template v-if="preview"><button class="secondary-button" :disabled="busy || confirming" @click="selected = preview.files.map(file => file.id)">选择本次全部</button><button class="quiet-button" :disabled="busy || confirming" @click="selected = []">取消选择</button><button class="native-danger-button" :disabled="busy || !selected.length" @click="confirming = true">清理所选 {{ selected.length }} 项</button></template></template>
    <template v-if="preview"><p class="native-path">{{ preview.root }}</p><p class="native-hint">候选 {{ preview.files.length }} 项 · {{ formatBytes(preview.totalBytes) }}；已选 {{ formatBytes(selectedBytes) }}。{{ preview.truncated ? '已达到扫描限制，仅显示本次候选。' : '' }} 跳过 {{ preview.skippedCount }} 项。</p>
      <div v-if="confirming" class="native-confirm"><strong>永久删除所选 {{ selected.length }} 个文件（{{ formatBytes(selectedBytes) }}）？</strong><p>执行时会重新检查路径、大小和修改时间；被占用或发生变化的文件会保留。</p><div><button class="secondary-button" :disabled="busy" @click="confirming = false">取消</button><button class="native-danger-button" :disabled="busy" @click="clean">确认永久删除</button></div></div>
      <div class="native-table-scroll"><table class="native-table"><thead><tr><th style="width: 40px">选择</th><th>临时文件</th><th style="width: 90px">大小</th><th style="width: 130px">最后修改</th></tr></thead><tbody><tr v-for="file in visible" :key="file.id"><td><input v-model="selected" type="checkbox" :value="file.id" :disabled="busy || confirming" :aria-label="`选择 ${file.path}`" /></td><td :title="file.path">{{ file.path }}</td><td>{{ formatBytes(file.bytes) }}</td><td>{{ formatDate(file.modifiedAt) }}</td></tr><tr v-if="!preview.files.length"><td colspan="4" class="native-empty">没有符合清理条件的文件。</td></tr></tbody></table></div><div class="native-pagination"><button class="quiet-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button class="quiet-button" :disabled="page >= pages" @click="page++">下一页</button></div>
    </template>
    <div v-if="result" class="native-detail"><h3>本次清理结果</h3><p class="native-success">已删除 {{ result.deletedCount }} 项 · {{ formatBytes(result.deletedBytes) }}</p><p class="native-hint">保留 {{ result.failures.length }} 项。继续清理请重新生成预览。</p><details v-if="result.failures.length"><summary>查看未删除原因</summary><p v-for="failure in result.failures" :key="failure.path" class="native-hint">{{ failure.path }} · {{ failure.reason }}</p></details></div>
  </NativeToolFrame>
</template>
