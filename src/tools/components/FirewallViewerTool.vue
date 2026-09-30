<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { filterFirewall, parseFirewallRows } from '../firewallViewer'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
const task = useNativeDiagnostic(), { busy, cancelling, error, result, summary } = task
const query = ref(''), direction = ref(''), enabled = ref(''), page = ref(1)
const snapshot = computed(() => parseFirewallRows(result.value?.output ?? ''))
const rows = computed(() => filterFirewall(snapshot.value.rows, query.value, direction.value, enabled.value))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
watch([query, direction, enabled, result], () => { page.value = 1 }, { flush: 'sync' })
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">手动只读查询 Windows 防火墙 ActiveStore（含合并策略）的规则。最多 1000 条 / 64 KiB / 20 秒，详情查询也计入总时限；可取消，不提权、不更改规则或保护设置。</p>
    <div class="action-buttons"><button class="primary-button" :disabled="busy" @click="task.start('run_firewall_snapshot')">读取防火墙规则</button><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="task.cancel">取消查询</button></div>
    <label>搜索已读取规则（名称、端口、地址、应用与服务）<input v-model="query" class="native-input" maxlength="256" /></label>
    <div class="action-buttons"><select v-model="direction" class="native-input" aria-label="方向"><option value="">全部方向</option><option value="Inbound">入站</option><option value="Outbound">出站</option></select>
      <select v-model="enabled" class="native-input" aria-label="启用状态"><option value="">全部状态</option><option value="True">启用</option><option value="False">禁用</option></select></div>
    <p v-if="snapshot.limited || (result && (result.status !== 'completed' || result.exitCode !== 0))" class="form-hint hint-error">结果不完整或部分详情无法读取；搜索仅覆盖已显示内容，空结果不代表不存在规则。</p>
    <div class="firewall-table"><table><thead><tr><th>名称 / 标识</th><th>方向 / 动作</th><th>启用 / 配置文件</th><th>详情</th></tr></thead><tbody>
      <tr v-for="r in visible" :key="r.name"><td>{{ r.displayName }}<br />{{ r.name }}</td><td>{{ r.direction }} / {{ r.action }}</td><td>{{ r.enabled }} / {{ r.profile }}</td><td><details><summary>筛选条件 · {{ r.source }}</summary><pre>{{ r.detail }}</pre></details></td></tr>
    </tbody></table></div>
    <p class="form-hint">{{ rows.length }} / {{ snapshot.rows.length }} 条 · 第 {{ page }} / {{ pages }} 页。列表不能证明流量最终允许或阻止，还取决于其他策略、服务和匹配条件；不做网络探测。</p>
    <div class="action-buttons"><button class="secondary-button" :disabled="page <= 1" @click="page--">上一页</button><button class="secondary-button" :disabled="page >= pages" @click="page++">下一页</button><button class="secondary-button" :disabled="busy" @click="task.clear">清空结果</button></div>
    <p class="form-hint" role="status">{{ busy ? '正在只读查询…' : summary }}</p><p class="form-hint hint-error">{{ error }}</p>
    <p class="form-hint">数据可能含私人路径和网络地址，仅本页内存、不自动保存或复制。此页面只提供规则查看；规则编辑为可选后续扩展，不在本次实现内。</p>
  </div>
</template>
<style scoped>
.firewall-table { max-height: 360px; overflow: auto; } table { width: 100%; font-size: 11px; text-align: left; }
th, td { padding: 7px; border-bottom: 1px solid #e5e5ec; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
</style>
