<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Play, Square } from '@lucide/vue'
import { useNetworkProbe } from '../useNetworkProbe'
const target = ref(''), count = ref(4), timeoutMs = ref(1000)
const { busy, cancelling, error, copied, result, summary, start, cancel, clear, copy } = useNetworkProbe(target, count, timeoutMs)
</script>

<template>
  <div class="tool-form probe-tool">
    <label for="ping-target">目标主机名或 IP</label>
    <input class="native-input" id="ping-target" v-model="target" :disabled="busy" type="text" maxlength="253" placeholder="输入你有权测试的主机名、IPv4 或 IPv6" spellcheck="false" @keydown.enter="start" />
    <div class="probe-options">
      <label>次数 <input class="native-input" v-model.number="count" :disabled="busy" type="number" min="1" max="10" /></label>
      <label>每次等待（毫秒） <input class="native-input" v-model.number="timeoutMs" :disabled="busy" type="number" min="250" max="2000" step="250" /></label>
    </div>
    <p class="form-hint">点击开始后，Windows 会向指定目标发送 ICMP 探测；主机名会交给系统 DNS 解析。
      最多 10 次、总时限 30 秒、输出最多 64 KiB。只测试你有权访问的目标，不自动运行、不保存结果。</p>
    <div class="field-heading"><label for="ping-output">命令结果</label>
      <button class="quiet-button" :disabled="!result?.output" @click="copy"><Copy :size="14" /> {{ copied ? '已复制' : '复制结果' }}</button>
    </div>
    <textarea id="ping-output" :value="result?.output ?? ''" class="code-input" readonly spellcheck="false" placeholder="任务结束或取消后显示结果"></textarea>
    <p class="form-hint" role="status">{{ busy ? (cancelling ? '正在停止并清理进程…' : '正在测试…') : summary }}</p>
    <p class="form-hint">系统原始输出保留响应时间与统计信息。超时或无响应也可能由防火墙、ICMP 限制引起，不等于目标服务不可用。</p>
    <div class="tool-action-row">
      <p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
      <div class="action-buttons">
        <button v-if="busy" class="secondary-button" :disabled="cancelling" @click="cancel"><Square :size="14" /> 取消</button>
        <button v-else class="secondary-button" @click="clear">清空结果</button>
        <button class="primary-button" :disabled="busy" @click="start"><Play :size="15" /> 开始测试</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.probe-tool > label, .probe-options label { color: #65697b; font-size: 10px; font-weight: 600; }
.probe-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.probe-options label { display: grid; gap: 7px; }
.probe-tool .native-input { width: 100%; min-width: 0; }
.probe-tool .native-input:disabled { opacity: .6; }
.probe-tool .form-hint { display: block; min-height: 0; line-height: 1.75; }
.probe-tool .tool-action-row { flex-wrap: wrap; gap: 10px; }
@media (max-width: 540px) { .probe-options { grid-template-columns: 1fr; } }
</style>
