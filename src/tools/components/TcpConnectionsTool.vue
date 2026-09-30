<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import { filterTcpConnections, parseTcpSnapshot } from '../tcpConnections'
import DiagnosticOutput from './DiagnosticOutput.vue'
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
const filter = ref(''), page = ref(1)
const snapshot = computed(() => parseTcpSnapshot(result.value?.output ?? '', result.value?.processOutput ?? ''))
const filtered = computed(() => filterTcpConnections(snapshot.value.rows, filter.value))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 50)))
const visible = computed(() => filtered.value.slice((page.value - 1) * 50, page.value * 50))
watch([filter, result], () => { page.value = 1 }, { flush: 'sync' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">手动读取本机 TCP 连接与监听快照，不联网探测、不反向解析远端域名、不自动刷新。读取连接与进程名称合计限时 20 秒，各最多 64 KiB；最多展示 2000 条 TCP 记录。</p>
    <button class="primary-button" :disabled="busy" @click="task.start('run_tcp_snapshot')">读取连接快照</button>
    <label for="tcp-filter">筛选地址、端口、状态、PID 或进程名</label><input id="tcp-filter" class="native-input" v-model="filter" maxlength="200" placeholder="例如 LISTENING、443、进程名" />
    <p class="form-hint">{{ filtered.length }} / {{ snapshot.rows.length }} 条 TCP 记录 · 第 {{ page }} / {{ pages }} 页</p>
    <p v-if="snapshot.limited || snapshot.skipped" class="form-hint">{{ snapshot.limited ? '达到 2000 条展示上限。' : '' }}{{ snapshot.skipped ? `${snapshot.skipped} 条无法识别的 TCP 行已跳过，请查看原始输出。` : '' }}</p>
    <p v-if="result?.processWarning" class="form-hint hint-error">{{ result.processWarning }}</p>
    <div class="tcp-scroll"><table><thead><tr><th>本地地址</th><th>远端地址</th><th>状态</th><th>PID</th><th>进程名（尽力匹配）</th></tr></thead><tbody><tr v-for="(row, index) in visible" :key="index"><td>{{ row.local }}</td><td>{{ row.remote }}</td><td>{{ row.state }}</td><td>{{ row.pid }}</td><td>{{ row.name }}</td></tr></tbody></table></div>
    <p v-if="result && !filtered.length" class="form-hint">没有匹配记录；如果读取未完成或失败，请同时检查状态与原始输出，不能据此认定没有连接。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button></div>
    <p class="form-hint">进程和连接分别采样，PID 可能重用；名称不用于安全判断。0.0.0.0 / [::] 的监听地址代表所有相应网卡，监听行的远端占位地址不代表已连接。结果包含本机与远端地址，复制前注意隐私。</p>
    <details><summary>原始 netstat 输出（含 UDP；复制按钮复制此原始输出）</summary><DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" /></details>
    <p role="status" class="form-hint">{{ busy ? '正在读取快照…' : summary }}</p><p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
    <div class="action-buttons"><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消</button><button v-else class="secondary-button" @click="task.clear">清空快照</button></div>
  </div>
</template>
<style scoped>
.tcp-scroll { overflow: auto; max-height: 380px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
th, td { padding: 7px 9px; border-bottom: 1px solid #e5e5ec; white-space: nowrap; }
summary { cursor: pointer; font-size: 12px; }
</style>
