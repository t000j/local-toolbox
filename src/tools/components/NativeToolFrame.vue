<script setup lang="ts">
defineProps<{ busy?: boolean; error?: string; message?: string; hint?: string }>()
</script>

<template>
  <div class="native-tool">
    <div class="native-toolbar"><slot name="toolbar" /></div>
    <p v-if="hint" class="native-hint">{{ hint }}</p>
    <p v-if="busy" class="native-loading" role="status"><span class="loading-pulse"></span> 正在处理…</p>
    <p v-if="error" class="native-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="native-success" role="status">{{ message }}</p>
    <slot />
  </div>
</template>
