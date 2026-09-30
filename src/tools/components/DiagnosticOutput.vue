<script setup lang="ts">
import type { DiagnosticResult } from '../useNativeDiagnostic'
defineProps<{ result: DiagnosticResult | null; busy: boolean; cancelling: boolean; copied: boolean; summary: string; error: string }>()
defineEmits<{ copy: []; cancel: []; clear: [] }>()
</script>
<template>
  <div class="field-heading"><label for="diagnostic-output">Windows 原始输出</label><button class="quiet-button" :disabled="!result?.output" @click="$emit('copy')">{{ copied ? '已复制' : '复制结果' }}</button></div>
  <textarea id="diagnostic-output" class="code-input" :value="result?.output ?? ''" readonly spellcheck="false" placeholder="命令结束或取消后显示结果" />
  <p class="form-hint" role="status">{{ busy ? (cancelling ? '正在停止并清理进程…' : '正在执行…') : summary }}</p>
  <p class="form-hint hint-error" aria-live="polite">{{ error }}</p>
  <div class="action-buttons"><button v-if="busy" class="secondary-button" :disabled="cancelling" @click="$emit('cancel')">取消</button><button v-else class="secondary-button" @click="$emit('clear')">清空结果</button></div>
</template>
