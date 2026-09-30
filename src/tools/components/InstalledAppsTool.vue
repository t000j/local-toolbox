<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { copyText } from '../clipboard'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'
import { useNativeTask } from '../nativeTools'
interface InstalledApp { id: string; name: string; version: string; publisher: string; installDate: string; location: string; scope: string }
interface AppList { items: InstalledApp[]; truncated: boolean; warnings: string[] }
const { busy, error, message, run } = useNativeTask()
const data = ref<AppList | null>(null)
const query = ref('')
const scope = ref('全部')
const selected = ref<InstalledApp | null>(null)
const scopes = computed(() => ['全部', ...new Set(data.value?.items.map((item) => item.scope) ?? [])])
const visible = computed(() => data.value?.items.filter((item) => (scope.value === '全部' || item.scope === scope.value) && `${item.name} ${item.publisher} ${item.version}`.toLowerCase().includes(query.value.toLowerCase())) ?? [])
async function refresh() { selected.value = null; const value = await run(() => invoke<AppList>('list_installed_apps')); if (value) data.value = value }
function selectApp(row: object) { selected.value = row as InstalledApp }
async function copyDetails() { if (selected.value) await run(() => copyText(JSON.stringify(selected.value, null, 2)), '软件公开信息已复制。') }
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="只读展示卸载注册表记录和当前用户商店应用；便携软件可能不会登记在此列表中。">
    <template #toolbar><input v-model="query" class="native-search" placeholder="搜索软件、版本或发布者…" aria-label="搜索软件" /><label>范围 <select v-model="scope"><option v-for="value in scopes" :key="value">{{ value }}</option></select></label><button class="secondary-button" :disabled="busy" @click="refresh">刷新列表</button></template>
    <p v-if="data?.truncated" class="native-hint">仅显示前 5000 条记录。</p><p v-for="warning in data?.warnings ?? []" :key="warning" class="native-hint">{{ warning }}</p>
    <NativeDataTable :rows="visible" :columns="[{key:'name',label:'软件名称'},{key:'version',label:'版本'},{key:'publisher',label:'发布者'},{key:'scope',label:'安装范围'}]" selectable @select="selectApp" />
    <div v-if="selected" class="native-detail"><h3>{{ selected.name }}</h3><pre>{{ '版本：' + (selected.version || '—') + '\n发布者：' + (selected.publisher || '—') + '\n安装日期（登记值）：' + (selected.installDate || '—') + '\n安装范围：' + selected.scope + '\n安装位置：' + (selected.location || '—') }}</pre><div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="copyDetails">复制信息</button><button class="quiet-button" @click="selected = null">收起</button></div></div>
  </NativeToolFrame>
</template>
