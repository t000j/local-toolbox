<script setup lang="ts">
import SystemManagerPanel from './SystemManagerPanel.vue'
</script>
<template>
  <SystemManagerPanel command="run_startup_manager" scope="仅当前用户 HKCU 的 64 位 Run 登记与 LocalToolbox 专用备份"
    warning="部分实现：不含启动文件夹、计划任务、RunOnce、32 位视图、全机项及 Windows StartupApproved 禁用标记；这里的启用仅表示 Run 值存在，不保证实际运行。不会执行启动命令。"
    consequence="禁用会在 HKCU\Software\LocalToolbox\StartupBackup 留存未加密原始命令备份，再删除 Run 值；下次登录可能不再启动。恢复可能使程序下次登录运行，保留备份。现有冲突备份不覆盖；不创建新启动项，不修改已有命令。" />
</template>
