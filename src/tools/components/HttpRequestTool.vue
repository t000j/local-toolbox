<script setup lang="ts">
import { ref, watch } from 'vue'
import { HTTP_METHODS, prepareHttpRequest } from '../httpRequest'
import { useNativeDiagnostic } from '../useNativeDiagnostic'
import DiagnosticOutput from './DiagnosticOutput.vue'
const url = ref(''), method = ref('GET'), headers = ref(''), body = ref(''), confirmed = ref(false)
const task = useNativeDiagnostic()
const { busy, cancelling, error, copied, result, summary } = task
watch([url, method, headers, body], () => { confirmed.value = false; task.clear() }, { flush: 'sync' })
async function send() {
  try {
    const request = prepareHttpRequest(url.value, method.value, headers.value, body.value)
    if (!confirmed.value) throw new Error('请先确认目标地址、方法和发送内容')
    await task.start('run_http_request', { request, confirmed: true })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
</script>
<template>
  <div class="tool-form">
    <p class="form-hint">从你的 Windows 电脑直接发送一次 HTTP(S) 请求。不会自动发送、跟随重定向、使用系统登录凭据 / Cookie / 代理或绕过证书验证；可访问你指定的本地服务。请确认目标可信且你有权限操作。</p>
    <label for="http-url">请求地址</label><input id="http-url" v-model="url" class="native-input" :disabled="busy" maxlength="4096" placeholder="https://example.invalid/api" autocomplete="off" spellcheck="false" />
    <label for="http-method">方法</label><select id="http-method" v-model="method" class="native-input" :disabled="busy"><option v-for="item in HTTP_METHODS" :key="item">{{ item }}</option></select>
    <label for="http-headers">请求头（每行 Name: value，最多 32 项 / 8 KiB）</label><textarea id="http-headers" v-model="headers" class="code-input" :disabled="busy" rows="3" maxlength="9000" autocomplete="off" spellcheck="false" placeholder="Accept: application/json" />
    <label for="http-body">UTF-8 正文（最多 64 KiB；GET / HEAD 必须为空）</label><textarea id="http-body" v-model="body" class="code-input" :disabled="busy" rows="5" maxlength="65536" autocomplete="off" spellcheck="false" />
    <p class="form-hint">请求头与正文仅在当前页面内存中，不保存历史；离页后丢弃。不要将密码或令牌发送到不可信地址；HTTP 明文不加密。POST / PUT / PATCH / DELETE 等请求可能改变远端数据，取消不能撤销已处理的请求。</p>
    <label><input v-model="confirmed" type="checkbox" :disabled="busy" /> 我已核对上方目标、{{ method }} 方法及数据，确认发送这一次请求</label>
    <button class="primary-button" :disabled="busy || !confirmed" @click="send">发送请求</button>
    <p class="form-hint">总时限 20 秒，网络预算 15 秒；响应头显示最多 8 Ki 字符、正文读取最多 32 KiB、总输出最多 64 KiB。响应按 UTF-8 纯文本显示，不执行 HTML；压缩、二进制或其他字符集内容可能不可读。3xx 仅显示，不自动跳转。HTTP 错误状态仍显示响应。</p>
    <DiagnosticOutput :result="result" :busy="busy" :cancelling="cancelling" :copied="copied" :summary="summary" :error="error" @copy="task.copy" @cancel="task.cancel" @clear="task.clear" />
  </div>
</template>
