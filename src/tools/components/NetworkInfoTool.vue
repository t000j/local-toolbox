<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { Check, CircleAlert, Copy, RefreshCw, Wifi, WifiOff } from '@lucide/vue'
import { copyText } from '../clipboard'

interface NetworkAdapterInfo {
  friendlyName: string
  description: string
  adapterType: string
  isUp: boolean
  ipv4Addresses: string[]
  ipv6Addresses: string[]
  gateways: string[]
  dnsServers: string[]
  physicalAddress: string
}

const adapters = ref<NetworkAdapterInfo[]>([])
const loading = ref(false)
const error = ref('')
const copied = ref(false)
const connectedAdapters = computed(() => adapters.value.filter((adapter) => adapter.isUp))
const disconnectedAdapters = computed(() => adapters.value.filter((adapter) => !adapter.isUp))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    adapters.value = await invoke<NetworkAdapterInfo[]>('get_network_info')
  } catch (cause) {
    adapters.value = []
    error.value = cause instanceof Error ? cause.message : '读取网卡信息失败，请重试。'
  } finally {
    loading.value = false
  }
}

async function copyAdapter(adapter: NetworkAdapterInfo): Promise<void> {
  const lines = [
    '适配器：' + adapter.friendlyName,
    '状态：' + (adapter.isUp ? '已连接' : '未连接'),
    'IPv4：' + (adapter.ipv4Addresses.join(', ') || '—'),
    'IPv6：' + (adapter.ipv6Addresses.join(', ') || '—'),
    '网关：' + (adapter.gateways.join(', ') || '—'),
    'DNS：' + (adapter.dnsServers.join(', ') || '—'),
  ]
  try {
    await copyText(lines.join('\n'))
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '复制失败，请检查剪贴板权限。'
  }
}

onMounted(refresh)
</script>

<template>
  <div class="network-tool">
    <div class="network-page-toolbar">
      <div class="network-overview-copy">
        <div class="network-overview-icon"><Wifi :size="19" /></div>
        <div>
          <span>本机网络</span>
          <h2>网络适配器</h2>
          <p>读取连接配置，不会修改系统设置。</p>
        </div>
      </div>
      <div class="network-toolbar-actions">
        <span class="network-count-chip">{{ connectedAdapters.length }} 个已连接</span>
        <button class="secondary-button" :disabled="loading" @click="refresh">
          <RefreshCw :size="15" :class="{ 'spin-icon': loading }" /> 刷新
        </button>
      </div>
    </div>

    <div v-if="error" class="network-error"><CircleAlert :size="17" /><span>{{ error }}</span></div>
    <div v-else-if="loading && !adapters.length" class="network-loading"><span class="loading-pulse"></span> 正在读取网络配置…</div>
    <div v-else-if="!adapters.length" class="network-empty">没有读取到网络适配器。</div>

    <div v-else-if="connectedAdapters.length" class="network-adapter-grid">
      <article v-for="adapter in connectedAdapters" :key="adapter.friendlyName" class="network-adapter-card">
        <div class="adapter-card-heading">
          <div class="adapter-icon"><Wifi :size="18" /></div>
          <div class="adapter-title">
            <h3>{{ adapter.friendlyName || '未命名适配器' }}</h3>
            <p>{{ adapter.adapterType }}</p>
          </div>
          <button class="adapter-copy-button" :aria-label="copied ? '已复制网络信息' : '复制网络信息'" @click="copyAdapter(adapter)">
            <Check v-if="copied" :size="14" /><Copy v-else :size="14" /> {{ copied ? '已复制' : '复制' }}
          </button>
        </div>

        <div class="network-primary-address">
          <span class="network-field-label">IPv4 地址</span>
          <div v-if="adapter.ipv4Addresses.length" class="network-address-list">
            <code v-for="address in adapter.ipv4Addresses" :key="address">{{ address }}</code>
          </div>
          <span v-else class="network-no-address">暂未分配</span>
        </div>

        <div v-if="adapter.gateways.length || adapter.dnsServers.length" class="network-route-grid">
          <div v-if="adapter.gateways.length" class="network-route-item">
            <span class="network-field-label">默认网关</span>
            <code v-for="gateway in adapter.gateways" :key="gateway">{{ gateway }}</code>
          </div>
          <div v-if="adapter.dnsServers.length" class="network-route-item">
            <span class="network-field-label">DNS 服务器</span>
            <code v-for="server in adapter.dnsServers" :key="server">{{ server }}</code>
          </div>
        </div>

        <details class="network-extra-details">
          <summary><span>更多信息</span><span>{{ adapter.ipv6Addresses.length }} 个 IPv6 地址</span></summary>
          <div class="network-extra-grid">
            <div>
              <span class="network-field-label">IPv6 地址</span>
              <code v-for="address in adapter.ipv6Addresses" :key="address">{{ address }}</code>
              <span v-if="!adapter.ipv6Addresses.length" class="network-no-address">—</span>
            </div>
            <div><span class="network-field-label">MAC 地址</span><code>{{ adapter.physicalAddress || '—' }}</code></div>
            <div class="network-description"><span class="network-field-label">设备描述</span><span>{{ adapter.description || '—' }}</span></div>
          </div>
        </details>
      </article>
    </div>

    <div v-else class="network-empty"><WifiOff :size="18" /> 当前没有已连接的网络适配器。</div>

    <details v-if="disconnectedAdapters.length" class="offline-adapter-details">
      <summary>其他适配器 <span>{{ disconnectedAdapters.length }}</span></summary>
      <div class="offline-adapter-list">
        <div v-for="adapter in disconnectedAdapters" :key="adapter.friendlyName" class="offline-adapter-row">
          <div class="adapter-icon disconnected"><WifiOff :size="16" /></div>
          <div><strong>{{ adapter.friendlyName || '未命名适配器' }}</strong><span>{{ adapter.adapterType }} · 未连接</span></div>
          <code>{{ adapter.ipv4Addresses.join(' · ') || '—' }}</code>
        </div>
      </div>
    </details>
  </div>
</template>
