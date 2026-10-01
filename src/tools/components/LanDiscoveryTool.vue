<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { validateLanCidr } from '../lanDiscovery'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import DiagnosticOutput from './DiagnosticOutput.vue'
const cidr = ref(''), confirmed = ref(false)
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
const range = computed(() => { try { return validateLanCidr(cidr.value) } catch { return null } })
watch(cidr, () => { confirmed.value = false; task.clear() }, { flush: 'sync' })
async function start() {
  try {
    const value = validateLanCidr(cidr.value)
    if (!confirmed.value) throw new Error('请先确认你有权探测该本地网段')
    await task.start('run_lan_discovery', { cidr: value.cidr, confirmed: true })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">仅手动发现你有权管理的局域网设备。Windows 会先验证整个范围属于当前已连接的以太网 / Wi-Fi 私有 IPv4 子网；不接受公网、IPv6 或大范围扫描。</p>
    <label for="lan-cidr">私有 IPv4 网段（/26–/30）</label>
    <input id="lan-cidr" v-model="cidr" class="native-input" :disabled="busy" maxlength="18" placeholder="192.168.1.0/26" />
    <p class="form-hint">{{ range ? `本次最多探测 ${range.hosts} 个地址` : '填写对齐的网段起始地址；最多 62 台，不含网段地址和广播地址' }}。并发 1，每台 1 次 ICMP、等待 500 毫秒，总时限 40 秒；不扫描端口、不查询名称、不自动重复。</p>
    <label><input v-model="confirmed" type="checkbox" :disabled="busy" /> 我有权探测这个本地网段，了解将向其中设备发送 ICMP</label>
    <button class="primary-button" :disabled="busy || !confirmed || !range" @click="start">开始局域网发现</button>
    <p class="form-hint">Success 表示收到该地址的回复；无回复可能是防火墙、休眠或 ICMP 被禁用，不能认定设备离线。虚拟网卡与路由策略可能影响结果。本工具不保存结果。</p>
    <DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" />
  </div>
</template>
