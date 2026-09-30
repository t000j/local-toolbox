<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open } from '@tauri-apps/plugin-dialog'
import { copyText } from '../clipboard'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'
import { useNativeTask } from '../nativeTools'
interface AccessRule { identity: string; rights: string; type: string; inherited: boolean; inheritance: string; propagation: string }
interface Permissions { path: string; owner: string; group: string; inheritanceProtected: boolean; rules: AccessRule[]; truncated: boolean }
const { busy, error, message, run } = useNativeTask()
const data = ref<Permissions | null>(null)
const selected = ref<AccessRule | null>(null)
const query = ref('')
const visible = computed(() => data.value?.rules.filter((rule) => `${rule.identity} ${rule.rights}`.toLowerCase().includes(query.value.toLowerCase())).map((rule) => ({ ...rule, typeLabel: rule.type === 'Allow' ? '允许' : rule.type === 'Deny' ? '拒绝' : rule.type, inheritedLabel: rule.inherited ? '继承' : '显式' })) ?? [])
async function selectPath(directory: boolean) {
  selected.value = null
  const value = await run(async () => {
    const path = await open({ title: directory ? '选择要查看权限的文件夹' : '选择要查看权限的文件', directory, multiple: false })
    return typeof path === 'string' ? invoke<Permissions>('inspect_file_permissions', { path }) : null
  })
  if (value) data.value = value
}
async function refresh() { if (data.value) { const value = await run(() => invoke<Permissions>('inspect_file_permissions', { path: data.value!.path })); if (value) { data.value = value; selected.value = null } } }
function selectRule(row: object) { selected.value = row as AccessRule }
async function copyPermissions() { if (data.value) await run(() => copyText(JSON.stringify(data.value, null, 2)), '文件权限信息已复制。') }
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="显示所有者与 DACL 权限条目。实际访问还受组成员身份、共享权限等影响；此页面不修改权限。">
    <template #toolbar><button class="primary-button" :disabled="busy" @click="selectPath(false)">选择文件</button><button class="secondary-button" :disabled="busy" @click="selectPath(true)">选择文件夹</button><button class="secondary-button" :disabled="busy || !data" @click="refresh">刷新</button><button class="quiet-button" :disabled="busy || !data" @click="copyPermissions">复制权限信息</button></template>
    <template v-if="data"><p class="native-path">{{ data.path }}</p><div class="native-stats"><article class="native-stat"><span>所有者</span><strong>{{ data.owner || '—' }}</strong></article><article class="native-stat"><span>所属组</span><strong>{{ data.group || '—' }}</strong></article><article class="native-stat"><span>权限继承</span><strong>{{ data.inheritanceProtected ? '已禁用继承' : '允许继承' }}</strong></article></div><input v-model="query" class="native-search" placeholder="筛选账户或权限…" aria-label="搜索权限条目" /><p v-if="data.truncated" class="native-hint">仅显示前 500 条权限规则。</p><NativeDataTable :rows="visible" :columns="[{key:'identity',label:'账户或组'},{key:'typeLabel',label:'允许 / 拒绝'},{key:'rights',label:'权限'},{key:'inheritedLabel',label:'来源'}]" selectable @select="selectRule" /><div v-if="selected" class="native-detail"><h3>{{ selected.identity }}</h3><pre>{{ '权限：' + selected.rights + '\n类型：' + selected.type + '\n继承标志：' + selected.inheritance + '\n传播标志：' + selected.propagation }}</pre><button class="quiet-button" @click="selected = null">收起</button></div></template>
    <p v-else class="native-empty">选择文件或文件夹查看访问控制信息。</p>
  </NativeToolFrame>
</template>
