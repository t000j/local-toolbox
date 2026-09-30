<script setup lang="ts">
import SystemManagerPanel from './SystemManagerPanel.vue'
</script>
<template>
  <SystemManagerPanel command="run_service_manager" scope="本机 Windows 服务（不包括驱动服务）"
    warning="仅支持无依赖服务的启动，以及无被依赖服务的停止；不改启动类型，不强制停止，不创建或删除服务。受限服务需在系统工具中由你处理。"
    consequence="启动可能运行该服务程序；停止可能中断网络、应用、数据处理或系统功能。没有自动回滚，反向操作也可能失败。" />
</template>
