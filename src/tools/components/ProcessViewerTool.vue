<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { filterProcesses, parseProcessSnapshot } from '../processViewer'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import DiagnosticOutput from './DiagnosticOutput.vue'
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
const query = ref(''), sort = ref('memory'), minMemory = ref(0), minCpu = ref(0), page = ref(1)
const snapshot = computed(() => parseProcessSnapshot(result.value?.output ?? ''))
const rows = computed(() => filterProcesses(snapshot.value.rows, query.value, Number(minMemory.value), Number(minCpu.value), sort.value))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 50)))
const visible = computed(() => rows.value.slice((page.value - 1) * 50, page.value * 50))
watch([query, sort, minMemory, minCpu, result], () => { page.value = 1 }, { flush: 'sync' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">手动读取当前本机进程快照，最多 2000 条 / 64 KiB 输出，15 秒总时限。只读、不结束进程、不提权、不自动刷新或保存；不读取命令行、路径和环境变量。</p>
    <button class="primary-button" :disabled="busy" @click="task.start('run_process_snapshot')">读取进程快照</button>
    <label for="process-query">名称或 PID</label><input id="process-query" v-model="query" class="native-input" maxlength="128" placeholder="筛选进程名或 PID" />
    <div class="process-filters">
      <label>最小工作集内存 MiB<input v-model="minMemory" class="native-input" type="number" min="0" max="1000000000" /></label>
      <label>最小累计 CPU 秒<input v-model="minCpu" class="native-input" type="number" min="0" max="1000000000" /></label>
      <label>排序<select v-model="sort" class="native-input"><option value="memory">工作集内存降序</option><option value="cpu">累计 CPU 秒降序</option><option value="pid">PID 升序</option><option value="name">名称</option></select></label>
    </div>
    <p class="form-hint">{{ rows.length }} / {{ snapshot.rows.length }} 条 · 第 {{ page }} / {{ pages }} 页。CPU 为进程自启动以来累计消耗的处理器秒数，不是实时 CPU 百分比。工作集内存包含共享页，不能相加视为系统总占用。</p>
    <p v-if="snapshot.limited || snapshot.skipped" class="form-hint">{{ snapshot.limited ? '达到进程条数上限。' : '' }}{{ snapshot.skipped ? `${snapshot.skipped} 条不完整或无法解析的行已跳过。` : '' }}请同时查看任务状态。</p>
    <div class="process-table"><table><thead><tr><th>名称</th><th>PID</th><th>工作集 MiB</th><th>累计 CPU 秒</th></tr></thead><tbody><tr v-for="row in visible" :key="row.pid"><td>{{ row.name }}</td><td>{{ row.pid }}</td><td>{{ row.memoryBytes === null ? '未知 / 无权限' : (row.memoryBytes / 1048576).toFixed(1) }}</td><td>{{ row.cpuSeconds === null ? '未知 / 无权限' : row.cpuSeconds.toFixed(2) }}</td></tr></tbody></table></div>
    <p v-if="result && !rows.length" class="form-hint">没有匹配结果；读取失败或不完整时不能认定没有进程。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button></div>
    <p class="form-hint">进程可能在采样期间退出，部分字段会显示未知；PID 会重用，名称不能用于安全判断。结果可能含软件使用信息，复制前注意隐私。</p>
    <details><summary>原始逐行 JSON 快照</summary><DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" /></details>
    <p role="status" class="form-hint">{{ busy ? '正在读取…' : summary }}</p><p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
    <div class="action-buttons"><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消</button><button v-else class="secondary-button" @click="task.clear">清空快照</button></div>
  </div>
</template>
<style scoped>
.process-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.process-filters label { display: grid; gap: 5px; font-size: 11px; }
.process-table { overflow: auto; max-height: 360px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid #e5e5ec; }
summary { cursor: pointer; font-size: 12px; }
@media (max-width: 700px) { .process-filters { grid-template-columns: 1fr; } }
</style>
