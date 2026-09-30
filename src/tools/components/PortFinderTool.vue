<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { AlertCircle, ArrowLeftRight, Check, Copy, LoaderCircle, Search, Server, X } from '@lucide/vue'
import { copyText } from '../clipboard'

interface PortProcessInfo {
  localAddress: string
  remoteAddress: string
  state: string
  processId: number
  processName: string
}

interface PortProcessGroup {
  processId: number
  processName: string
  records: PortProcessInfo[]
  listeners: PortProcessInfo[]
  activeConnections: PortProcessInfo[]
  otherConnections: PortProcessInfo[]
}

const port = ref('8080')
const results = ref<PortProcessInfo[]>([])
const loading = ref(false)
const searched = ref(false)
const error = ref('')
const copiedProcess = ref<number | null>(null)
const pendingGroup = ref<PortProcessGroup | null>(null)
const terminating = ref(false)
const dialogError = ref('')
const protectedProcessNames = new Set(['system', 'registry', 'system idle process', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'winlogon.exe', 'svchost.exe'])

function isListening(state: string): boolean {
  const normalized = state.toLowerCase()
  return normalized.includes('listen') || normalized.includes('侦听') || normalized.includes('监听')
}

function isEstablished(state: string): boolean {
  const normalized = state.toLowerCase()
  return normalized.includes('establish') || normalized.includes('已建立')
}

const processGroups = computed<PortProcessGroup[]>(() => {
  const byProcess = new Map<number, PortProcessInfo[]>()
  for (const record of results.value) {
    const records = byProcess.get(record.processId) ?? []
    records.push(record)
    byProcess.set(record.processId, records)
  }

  return [...byProcess.entries()].map(([processId, records]) => ({
    processId,
    processName: records[0]?.processName ?? '未知进程',
    records,
    listeners: records.filter((record) => isListening(record.state)),
    activeConnections: records.filter((record) => isEstablished(record.state)),
    otherConnections: records.filter((record) => !isListening(record.state) && !isEstablished(record.state)),
  })).sort((left, right) => left.processName.localeCompare(right.processName))
})

const listeningCount = computed(() => processGroups.value.reduce((count, group) => count + group.listeners.length, 0))
const activeConnectionCount = computed(() => processGroups.value.reduce((count, group) => count + group.activeConnections.length, 0))

function canTerminate(group: PortProcessGroup): boolean {
  return group.listeners.length > 0 &&
    group.processId > 4 &&
    group.processName !== '未知进程' &&
    !protectedProcessNames.has(group.processName.toLowerCase())
}

function addressScope(address: string): string {
  const separator = address.lastIndexOf(':')
  const host = separator >= 0 ? address.slice(0, separator).replace(/^\[|\]$/g, '') : address
  if (host === '0.0.0.0') return '所有 IPv4 网卡'
  if (host === '::') return '所有 IPv6 网卡'
  if (host === '127.0.0.1' || host === '::1') return '仅本机'
  return '指定网卡'
}

function stateLabel(state: string): string {
  if (isListening(state)) return '正在监听'
  if (isEstablished(state)) return '已建立'
  return state
}

function requestTerminate(group: PortProcessGroup): void {
  if (!canTerminate(group)) return
  pendingGroup.value = group
  dialogError.value = ''
}

function cancelTermination(): void {
  if (terminating.value) return
  pendingGroup.value = null
  dialogError.value = ''
}

async function searchPort(): Promise<void> {
  const portNumber = Number(port.value)
  error.value = ''
  results.value = []
  searched.value = false
  copiedProcess.value = null
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    error.value = '请输入 1 到 65535 之间的端口号。'
    return
  }

  loading.value = true
  try {
    results.value = await invoke<PortProcessInfo[]>('find_port_owners', { port: portNumber })
    searched.value = true
  } catch (cause) {
    error.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '读取端口信息失败，请重试。'
  } finally {
    loading.value = false
  }
}

async function copyGroup(group: PortProcessGroup): Promise<void> {
  const summary = [
    '端口：' + port.value,
    '进程：' + group.processName,
    'PID：' + group.processId,
    '监听地址：' + (group.listeners.map((record) => record.localAddress).join(', ') || '无'),
    '活动连接：' + group.activeConnections.length,
    ...group.records.map((record) => record.state + ' ' + record.localAddress + ' ← ' + record.remoteAddress),
  ]
  try {
    await copyText(summary.join('\n'))
    copiedProcess.value = group.processId
    window.setTimeout(() => { copiedProcess.value = null }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

async function confirmTermination(): Promise<void> {
  const group = pendingGroup.value
  if (!group || !canTerminate(group)) return
  terminating.value = true
  dialogError.value = ''
  try {
    await invoke('terminate_port_process', { port: Number(port.value), processId: group.processId })
    pendingGroup.value = null
    searched.value = false
    await searchPort()
  } catch (cause) {
    dialogError.value = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '结束进程失败，请重试。'
  } finally {
    terminating.value = false
  }
}
</script>

<template>
  <div class="port-tool">
    <div class="port-search-panel">
      <div class="port-search-copy">
        <div class="port-icon"><Server :size="19" /></div>
        <div><strong>查找 TCP 端口对应进程</strong><p>相同进程的监听与连接会合并展示。</p></div>
      </div>
      <div class="port-search-control">
        <label for="port-number">端口</label>
        <input id="port-number" v-model="port" class="text-input" type="number" min="1" max="65535" inputmode="numeric" placeholder="8080" @keydown.enter="searchPort" />
        <button class="primary-button" :disabled="loading" @click="searchPort">
          <LoaderCircle v-if="loading" class="spin-icon" :size="15" />
          <Search v-else :size="15" /> {{ loading ? '查询中…' : '查询端口' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="port-message port-error"><AlertCircle :size="16" /><span>{{ error }}</span></div>
    <div v-else-if="searched && !results.length" class="port-message port-empty"><Check :size="16" /><span>当前没有发现 TCP 端口 {{ port }} 的连接记录。</span></div>
    <section v-else-if="processGroups.length" class="port-results">
      <div class="port-results-heading">
        <div><strong>占用进程</strong><span>{{ processGroups.length }} 个进程 · {{ listeningCount }} 个监听 · {{ activeConnectionCount }} 条活动连接</span></div>
        <span>TCP {{ port }}</span>
      </div>

      <article v-for="group in processGroups" :key="group.processId" class="port-result-card">
        <div class="process-overview">
          <div class="process-avatar"><Server :size="17" /></div>
          <div class="process-details">
            <strong>{{ group.processName }}</strong>
            <span>PID {{ group.processId }} <i>·</i> {{ group.listeners.length ? '正在监听' : '存在活动连接' }}</span>
          </div>
          <button class="quiet-button process-copy-button" :aria-label="copiedProcess === group.processId ? '已复制进程信息' : '复制进程信息'" @click="copyGroup(group)">
            <Check v-if="copiedProcess === group.processId" :size="14" /><Copy v-else :size="14" /> {{ copiedProcess === group.processId ? '已复制' : '复制' }}
          </button>
        </div>

        <div v-if="group.listeners.length" class="process-listener-block">
          <span class="port-section-label">监听地址</span>
          <div v-for="listener in group.listeners" :key="listener.localAddress + listener.state" class="listener-row">
            <div class="listener-address"><code>{{ listener.localAddress }}</code><span>{{ addressScope(listener.localAddress) }}</span></div>
            <span class="listener-state">{{ stateLabel(listener.state) }}</span>
          </div>
        </div>

        <details v-if="group.activeConnections.length || group.otherConnections.length" class="port-connection-details">
          <summary>
            <span>{{ group.activeConnections.length }} 条活动连接<span v-if="group.otherConnections.length"> · {{ group.otherConnections.length }} 条其他记录</span></span>
            <span class="connection-expand-label">查看连接</span>
          </summary>
          <div class="connection-rows">
            <div v-for="record in [...group.activeConnections, ...group.otherConnections]" :key="record.localAddress + record.remoteAddress + record.state" class="connection-row">
              <span class="connection-state" :class="{ established: isEstablished(record.state) }">{{ stateLabel(record.state) }}</span>
              <div class="connection-pair">
                <code>{{ record.remoteAddress }}</code>
                <ArrowLeftRight :size="13" />
                <code>{{ record.localAddress }}</code>
              </div>
            </div>
          </div>
        </details>

        <div class="port-process-actions">
          <span v-if="group.activeConnections.length" class="connection-impact">{{ group.activeConnections.length }} 条连接使用此进程</span>
          <button class="terminate-button" :disabled="!canTerminate(group)" :title="canTerminate(group) ? '结束进程并释放监听端口' : '系统、无法识别或未监听端口的进程受到保护'" @click="requestTerminate(group)">
            <X :size="14" /> 结束进程并释放端口
          </button>
        </div>
      </article>
    </section>
    <div v-else class="port-placeholder"><div class="port-placeholder-icon"><Search :size="20" /></div><strong>输入端口号开始查询</strong><span>例如 8080、3000 或 5173</span></div>

    <div v-if="pendingGroup" class="port-confirm-overlay" @click.self="cancelTermination">
      <section class="port-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="terminate-title">
        <button class="port-dialog-close" aria-label="取消结束进程" :disabled="terminating" @click="cancelTermination"><X :size="17" /></button>
        <div class="port-confirm-icon"><AlertCircle :size="20" /></div>
        <h3 id="terminate-title">确认结束此进程？</h3>
        <p>Windows 将尝试结束该程序并释放监听端口；{{ pendingGroup.activeConnections.length }} 条活动连接也会断开，未保存的数据可能丢失。</p>
        <div class="port-confirm-details">
          <span>进程</span><strong>{{ pendingGroup.processName }}</strong>
          <span>PID</span><strong>{{ pendingGroup.processId }}</strong>
          <span>端口</span><strong>{{ port }}</strong>
          <span>监听地址</span><strong>{{ pendingGroup.listeners.map((record) => record.localAddress).join(', ') }}</strong>
        </div>
        <p v-if="dialogError" class="port-dialog-error">{{ dialogError }}</p>
        <div class="port-confirm-actions">
          <button class="secondary-button" :disabled="terminating" @click="cancelTermination">取消</button>
          <button class="danger-button" :disabled="terminating" @click="confirmTermination">
            <LoaderCircle v-if="terminating" class="spin-icon" :size="14" />
            <X v-else :size="14" /> {{ terminating ? '处理中…' : '确认结束进程' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
