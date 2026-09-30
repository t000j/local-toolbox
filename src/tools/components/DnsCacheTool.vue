<script setup lang="ts">
import { ref } from 'vue'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import DiagnosticOutput from './DiagnosticOutput.vue'
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
const confirming = ref(false), operation = ref<'view' | 'flush'>('view')
function view() {
  if (busy.value || confirming.value) return
  operation.value = 'view'; void task.start('run_dns_cache', { flush: false, confirmed: false })
}
function flush() {
  if (!confirming.value || busy.value) return
  confirming.value = false; operation.value = 'flush'
  void task.start('run_dns_cache', { flush: true, confirmed: true })
}
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">只在点击后读取 Windows DNS 客户端缓存，可能包含访问过的域名与 Hosts 预加载条目；不会读取浏览器自身缓存。结果仅留在当前页面，复制前注意隐私。总时限 15 秒，输出最多 64 KiB。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy || confirming" @click="view">查看缓存</button><button class="secondary-button" :disabled="busy || confirming" @click="confirming = true">清空 DNS 缓存…</button></div>
    <section v-if="confirming" role="alertdialog" aria-modal="false" aria-labelledby="flush-title" aria-describedby="flush-impact" class="cache-confirm" @keydown.esc.stop="confirming = false">
      <h3 id="flush-title">确认清空本机 DNS 缓存？</h3>
      <p id="flush-impact">将运行 ipconfig /flushdns，清空 Windows 动态 DNS 解析缓存，后续访问可能重新联网解析并短暂变慢。此操作无法撤销，不修改 DNS 服务器或网卡配置。不会自动提权；权限不足时请自行决定是否以管理员身份重新打开应用。</p>
      <div class="action-buttons"><button class="secondary-button" @click="confirming = false">返回</button><button class="primary-button" @click="flush">确认清空</button></div>
    </section>
    <p v-if="operation === 'flush'" class="form-hint">本次为清空操作。取消或超时只能停止命令，不能撤销已发生的清空；请依据原始输出判断结果，必要时手动查看缓存。不会自动重试。</p>
    <DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" />
  </div>
</template>
<style scoped>
.cache-confirm { padding: 12px; border: 1px solid #d7b979; border-radius: 8px; font-size: 12px; line-height: 1.7; }
.cache-confirm h3 { margin-top: 0; font-size: 13px; }
</style>
