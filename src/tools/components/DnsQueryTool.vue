<script setup lang="ts">
import { ref, watch } from 'vue'
import { validateNetworkTarget } from '../networkTarget'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import DiagnosticOutput from './DiagnosticOutput.vue'
const target = ref(''), recordType = ref('A')
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
watch([target, recordType], task.clear, { flush: 'sync' })
function query() {
  if (busy.value) return
  task.clear()
  try { validateNetworkTarget(target.value) } catch (cause) { error.value = String(cause); return }
  void task.start('run_dns_query', { target: target.value, recordType: recordType.value })
}
</script>
<template>
  <div class="tool-form">
    <label for="dns-target">域名或 IP</label><input id="dns-target" class="native-input" v-model="target" :disabled="busy" maxlength="253" spellcheck="false" placeholder="example.com；国际化域名请使用 Punycode" @keydown.enter="query" />
    <label for="dns-type">记录类型</label><select id="dns-type" class="native-input" v-model="recordType" :disabled="busy"><option v-for="type in ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR']" :key="type">{{ type }}</option></select>
    <p class="form-hint">仅点击查询后向系统默认 DNS 服务器联网查询；使用 nslookup，域名按完整名称查询，不添加搜索后缀。IP 可用于反向查询。总时限 15 秒，输出最多 64 KiB，不自动运行或保存。</p>
    <button class="primary-button" :disabled="busy" @click="query">查询 DNS</button>
    <DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" />
    <p class="form-hint">命令完成与退出码不保证解析成功，请查看原始输出中的无记录、超时或拒绝信息；结果不是 DNSSEC 验证，也不代表服务可用。</p>
  </div>
</template>
