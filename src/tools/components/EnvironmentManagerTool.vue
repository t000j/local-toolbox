<script setup lang="ts">
import SystemManagerPanel from './SystemManagerPanel.vue'
</script>
<template>
  <SystemManagerPanel command="run_environment_manager" scope="用户 / 系统持久环境变量（64 位注册表原始值）"
    warning="部分实现：仅编辑既有普通用户变量，保留字符串类型；不新增、删除、修改系统变量或 PATH 等受保护名称。敏感名称值不读取；名称筛选无法识别所有秘密，普通值仍可能敏感。不会读取进程环境。"
    consequence="修改影响后续登录会话中的应用；不广播环境更新，不改变已运行进程，可能需要注销后重新登录。不展开 %变量%，不自动备份或回滚；请在确认前自行妥善留存旧值，恢复也需再次预览确认。错误值可能使依赖它的应用异常。" />
</template>
