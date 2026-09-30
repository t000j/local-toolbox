<script setup lang="ts">
import { computed, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { open } from '@tauri-apps/plugin-dialog'
import NativeToolFrame from './NativeToolFrame.vue'
import { useNativeTask } from '../nativeTools'
interface Workspace { id: string; name: string; paths: string[] }
interface LaunchResult { path: string; launched: boolean; detail: string }
const storageKey = 'toolbox:workspaces:v1'
const { busy, error, message, run } = useNativeTask()
const groups = ref<Workspace[]>(readGroups())
const activeId = ref(groups.value[0]?.id ?? '')
const active = computed(() => groups.value.find((group) => group.id === activeId.value))
const name = ref('')
const results = ref<LaunchResult[]>([])
const pendingDelete = ref(false)
function readGroups(): Workspace[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is Workspace => !!item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.paths) && item.paths.every((path: unknown) => typeof path === 'string')).slice(0, 20).map((item) => ({ ...item, paths: item.paths.slice(0, 20) }))
  } catch { return [] }
}
function persist(next: Workspace[]): boolean {
  try { localStorage.setItem(storageKey, JSON.stringify(next)); groups.value = next; results.value = []; return true }
  catch { error.value = '无法保存本机工作区，当前更改未保存。'; return false }
}
function createGroup() {
  if (!name.value.trim()) { error.value = '请输入工作区名称。'; return }
  if (groups.value.length >= 20) { error.value = '最多保存 20 个工作区。'; return }
  const group = { id: crypto.randomUUID(), name: name.value.trim(), paths: [] }
  if (persist([...groups.value, group])) { activeId.value = group.id; name.value = '' }
}
async function addTarget(directory: boolean) {
  if (!active.value || active.value.paths.length >= 20) { error.value = '每个工作区最多 20 项。'; return }
  const id = active.value.id
  await run(async () => {
    const path = await open({ title: directory ? '选择工作区文件夹' : '选择要启动的应用', directory, multiple: false, ...(directory ? {} : { filters: [{ name: 'Windows 应用', extensions: ['exe'] }] }) })
    if (typeof path !== 'string') return
    const group = groups.value.find((item) => item.id === id)
    if (!group || group.paths.some((item) => item.toLowerCase() === path.toLowerCase())) return
    if (!persist(groups.value.map((item) => item.id === id ? { ...item, paths: [...item.paths, path] } : item))) throw new Error('工作区保存失败。')
  })
}
function removeTarget(path: string) { if (active.value) persist(groups.value.map((item) => item.id === activeId.value ? { ...item, paths: item.paths.filter((value) => value !== path) } : item)) }
function deleteGroup() {
  if (persist(groups.value.filter((item) => item.id !== activeId.value))) { activeId.value = groups.value[0]?.id ?? ''; pendingDelete.value = false }
}
async function launch(paths: string[]) { const result = await run(() => invoke<LaunchResult[]>('launch_workspace', { paths })); if (result) results.value = result }
async function launchActive() { if (active.value) await launch(active.value.paths) }
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="最多 20 个工作区，每个保存 20 个应用或文件夹。仅在点击启动时打开，应用不附加命令行参数。">
    <template #toolbar><input v-model="name" class="native-search" maxlength="60" placeholder="新工作区名称…" aria-label="工作区名称" /><button class="secondary-button" :disabled="busy" @click="createGroup">创建工作区</button></template>
    <div class="native-toolbar"><label>工作区 <select v-model="activeId" :disabled="busy" @change="results = []; pendingDelete = false"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select></label><button class="secondary-button" :disabled="busy || !active" @click="addTarget(false)">添加应用</button><button class="secondary-button" :disabled="busy || !active" @click="addTarget(true)">添加文件夹</button><button class="primary-button" :disabled="busy || !active?.paths.length" @click="launchActive">启动全部</button><button class="quiet-button native-danger" :disabled="busy || !active" @click="pendingDelete = true">删除工作区</button></div>
    <div v-if="pendingDelete && active" class="native-confirm"><strong>删除“{{ active.name }}”的快捷配置？</strong><p>仅删除工作区配置，目标应用和文件夹保留。</p><div><button class="secondary-button" @click="pendingDelete = false">取消</button><button class="native-danger-button" @click="deleteGroup">确认删除</button></div></div>
    <div class="native-card-list"><article v-for="path in active?.paths ?? []" :key="path" class="native-record"><div class="native-record-main"><strong>{{ path.split(/[\\/]/).pop() || path }}</strong><span>{{ path }}</span></div><div class="native-record-actions"><button class="quiet-button" :disabled="busy" @click="launch([path])">打开</button><button class="quiet-button" :disabled="busy" @click="removeTarget(path)">移除</button></div></article><p v-if="!active?.paths.length" class="native-empty">选择或创建工作区，再添加应用与文件夹。</p></div>
    <div v-if="results.length" class="native-detail"><h3>启动结果</h3><p v-for="result in results" :key="result.path" :class="result.launched ? 'native-success' : 'native-error'">{{ result.path }} · {{ result.detail }}</p></div>
  </NativeToolFrame>
</template>
