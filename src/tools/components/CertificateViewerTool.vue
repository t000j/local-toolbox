<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { trackedInvoke as invoke } from '../../app/activity'
import { copyText } from '../clipboard'
import NativeToolFrame from './NativeToolFrame.vue'
import NativeDataTable from './NativeDataTable.vue'
import { formatDate, useNativeTask } from '../nativeTools'
interface Certificate { subject: string; issuer: string; thumbprint: string; notBefore: string; notAfter: string; hasPrivateKey: boolean; friendlyName: string; serialNumber: string }
interface CertificateList { items: Certificate[]; truncated: boolean }
const { busy, error, message, run } = useNativeTask()
const scope = ref('CurrentUser')
const store = ref('My')
const query = ref('')
const validity = ref('all')
const data = ref<CertificateList | null>(null)
const selected = ref<Certificate | null>(null)
function status(item: Certificate): string {
  const now = Date.now()
  if (new Date(item.notAfter).getTime() < now) return '已过期'
  if (new Date(item.notBefore).getTime() > now) return '尚未生效'
  return '在有效期内'
}
const visible = computed(() => data.value?.items.filter((item) => `${item.subject} ${item.issuer} ${item.thumbprint} ${item.friendlyName}`.toLowerCase().includes(query.value.toLowerCase()) && (validity.value === 'all' || status(item) === validity.value)).map((item) => ({ ...item, expires: formatDate(item.notAfter), validity: status(item) })) ?? [])
async function refresh() {
  data.value = null; selected.value = null
  const value = await run(() => invoke<CertificateList>('list_local_certificates', { scope: scope.value, store: store.value }))
  if (value) data.value = value
}
function selectCertificate(row: object) { selected.value = row as Certificate }
async function copyDetails() { if (selected.value) await run(() => copyText(JSON.stringify(selected.value, null, 2)), '证书公开信息已复制。') }
onMounted(refresh)
</script>
<template>
  <NativeToolFrame :busy="busy" :error="error" :message="message" hint="只读查看本机证书公开信息，最多 1000 条；有效期状态不代表证书链已验证。不会读取私钥内容。">
    <template #toolbar><label>范围 <select v-model="scope" :disabled="busy" @change="refresh"><option value="CurrentUser">当前用户</option><option value="LocalMachine">本地计算机</option></select></label><label>存储区 <select v-model="store" :disabled="busy" @change="refresh"><option value="My">个人</option><option value="Root">受信任根证书</option><option value="CA">中间证书</option></select></label><button class="secondary-button" :disabled="busy" @click="refresh">刷新</button></template>
    <div class="native-toolbar"><input v-model="query" class="native-search" placeholder="搜索主题、颁发者或指纹…" aria-label="搜索证书" /><label>有效期 <select v-model="validity"><option value="all">全部</option><option>在有效期内</option><option>已过期</option><option>尚未生效</option></select></label></div><p v-if="data?.truncated" class="native-hint">当前存储区仅显示前 1000 条证书。</p>
    <NativeDataTable :rows="visible" :columns="[{key:'subject',label:'证书主题'},{key:'issuer',label:'颁发者'},{key:'expires',label:'到期时间'},{key:'validity',label:'有效期状态'}]" selectable @select="selectCertificate" />
    <div v-if="selected" class="native-detail"><h3>{{ selected.friendlyName || '证书详情' }}</h3><pre>{{ '主题：' + selected.subject + '\n颁发者：' + selected.issuer + '\n生效：' + formatDate(selected.notBefore) + '\n到期：' + formatDate(selected.notAfter) + '\n指纹：' + selected.thumbprint + '\n序列号：' + selected.serialNumber + '\n有关联私钥：' + (selected.hasPrivateKey ? '是（仅读取存在标志）' : '否') }}</pre><div class="native-toolbar"><button class="secondary-button" :disabled="busy" @click="copyDetails">复制公开信息</button><button class="quiet-button" @click="selected = null">收起</button></div></div>
  </NativeToolFrame>
</template>
