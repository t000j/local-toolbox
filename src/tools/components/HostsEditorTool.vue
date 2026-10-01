<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useToolLeaveGuard, requestToolNavigation } from '../../app/toolNavigation'
import { trackedInvoke as invoke } from '../../app/activity'
interface Snapshot { path: string; content: string; bom: boolean; backup: string | null }
const snapshot = ref<Snapshot | null>(null), content = ref(''), busy = ref(false), error = ref(''), notice = ref('')
const preview = ref(false), accepted = ref(false), editing = ref(false)
let disposed = false
useToolLeaveGuard({ label: 'Hosts 编辑尚未保存', dirty: () => content.value !== (snapshot.value?.content ?? ''), busy: () => busy.value,
  escape: () => { if (preview.value) { preview.value = false; accepted.value = false; return true }; return false },
})
const changes = computed(() => {
  const old = (snapshot.value?.content ?? '').split(/\r?\n/), next = content.value.split(/\r?\n/)
  return Array.from({ length: Math.max(old.length, next.length) }, (_, i) => ({ line: i + 1, old: old[i], next: next[i] }))
    .filter(row => row.old !== row.next)
})
async function run(save = false) {
  if (busy.value || disposed || (save && (!snapshot.value || !preview.value || !accepted.value || !editing.value))) return
  busy.value = true; error.value = ''; preview.value = false; accepted.value = false
  const old = snapshot.value
  try {
    const result = await invoke<Snapshot>('manage_hosts', { request: { action: save ? 'save' : 'read',
      expected: save ? old!.content : '', content: save ? content.value : '', bom: old?.bom ?? false, confirmed: save } })
    if (!disposed) {
      snapshot.value = result; content.value = result.content
      notice.value = result.backup ? `保存并核验成功。原始备份：${result.backup}` : '已读取。编辑不会自动写入。'
    }
  } catch (cause) {
    if (!disposed) { error.value = String(cause); if (save) { snapshot.value = null; notice.value = '保存结果未核验，请重新读取；不自动重试或回滚。' } }
  } finally { busy.value = false }
}
onBeforeUnmount(() => { disposed = true; snapshot.value = null; content.value = ''; preview.value = false; accepted.value = false })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">仅 Windows 系统固定 Hosts 路径；严格 UTF-8 / ASCII（保留 BOM），最多 256 KiB。拒绝链接路径、硬链接和无效主机格式；不提权或改变权限，权限不足即失败。备份在原目录，未加密，请妥善保管。</p>
    <button class="primary-button" :disabled="busy" @click="requestToolNavigation(() => run(false))">读取 / 重新读取（丢弃本页编辑）</button>
    <p class="form-hint">{{ snapshot?.path }}</p>
    <label><input v-model="editing" type="checkbox" :disabled="busy || !snapshot" @change="preview = false; accepted = false" /> 允许本页编辑（写入仍需另行确认）</label>
    <textarea v-model="content" class="native-input" rows="12" maxlength="262141" spellcheck="false" :readonly="!editing || busy || !snapshot" @input="preview = false; accepted = false" />
    <button class="secondary-button" :disabled="busy || !editing || !snapshot || content === snapshot.content" @click="preview = true; accepted = false">预览变更</button>
    <section v-if="preview" class="hosts-preview" aria-label="Hosts 变更确认">
      <p>目标：{{ snapshot?.path }}；将备份原始字节后写入新内容。保留原文件权限与 BOM，不自动清空 DNS 缓存。</p>
      <p class="form-hint hint-error">这会改变全机名称解析，错误映射可能导致网站无法访问或连接错误主机。仅保存你信任的映射。写入提交后不能取消；若中断可能需按所显示备份手动恢复。</p>
      <div class="hosts-diff"><div v-for="row in changes" :key="row.line"><b>第 {{ row.line }} 行</b><pre>− {{ row.old ?? '（无）' }}
+ {{ row.next ?? '（无）' }}</pre></div></div>
      <p v-if="!changes.length">仅换行符变化，仍会原样保存新文本。</p>
      <label><input v-model="accepted" type="checkbox" /> 我确认此路径、全部差异、未加密备份及全机解析影响，授权本次保存</label>
      <div class="action-buttons"><button class="primary-button" :disabled="!accepted || busy" @click="run(true)">确认备份并保存一次</button><button class="secondary-button" @click="preview = false; accepted = false">取消预览</button></div>
    </section>
    <p class="form-hint" role="status">{{ busy ? '正在处理，请等待结果；不要重复提交…' : notice }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">读取后若外部修改，保存会拒绝。比较、备份及写入持有独占文件句柄；系统崩溃不保证事务回滚。不自动恢复备份、不联网、不保存编辑草稿。</p>
  </div>
</template>
<style scoped>
.hosts-preview { padding: 10px; border: 1px solid #d5ad73; border-radius: 6px; font-size: 12px; }
.hosts-diff { max-height: 260px; overflow: auto; } pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
