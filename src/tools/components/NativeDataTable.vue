<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props = defineProps<{ rows: object[]; columns: { key: string; label: string }[]; selectable?: boolean }>()
const emit = defineEmits<{ select: [row: object] }>()
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(props.rows.length / 50)))
const visible = computed(() => props.rows.slice((page.value - 1) * 50, page.value * 50))
watch(() => props.rows, () => { page.value = 1 })
function field(row: object, key: string): string {
  const value = (row as Record<string, unknown>)[key]
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="native-table-section">
    <div class="native-table-scroll"><table class="native-table"><thead><tr><th v-for="column in columns" :key="column.key">{{ column.label }}</th><th v-if="selectable">详情</th></tr></thead><tbody>
      <tr v-for="(row, index) in visible" :key="index"><td v-for="column in columns" :key="column.key" :title="field(row, column.key)">{{ field(row, column.key) }}</td><td v-if="selectable"><button class="quiet-button" @click="emit('select', row)">查看</button></td></tr>
      <tr v-if="!rows.length"><td :colspan="columns.length + (selectable ? 1 : 0)" class="native-empty">暂无匹配记录</td></tr>
    </tbody></table></div>
    <div class="native-pagination"><span>{{ rows.length }} 条 · 每页 50 条</span><button class="quiet-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button class="quiet-button" :disabled="page >= pages" @click="page++">下一页</button></div>
  </div>
</template>
