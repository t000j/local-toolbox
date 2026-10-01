export const powerActions = [
  { id: 'lock', name: '锁屏', impact: '立即锁定当前会话，程序继续运行；需按系统登录方式解锁。锁屏本身无法撤销。' },
  { id: 'sleep', name: '睡眠', impact: '使整台电脑进入系统支持的睡眠状态，暂停工作与网络连接，影响其他用户；唤醒由系统处理，可能受混合睡眠和电源策略影响。' },
  { id: 'logoff', name: '注销', impact: '结束当前用户会话并关闭应用，未保存数据可能丢失。提交后无法在本工具撤销。' },
  { id: 'restart', name: '重启', impact: '整台电脑重启，所有用户会话和任务将中断，未保存数据可能丢失。请先告知其他用户并保存工作。' },
  { id: 'shutdown', name: '关机', impact: '整台电脑关机，所有用户会话和任务将中断，未保存数据可能丢失。请先告知其他用户并保存工作。' },
] as const
export type PowerAction = typeof powerActions[number]
/** Only a page-local countdown. Never schedules an OS shutdown. */
export function createPowerCountdown(run: () => void, tick: (seconds: number) => void) {
  let timer: ReturnType<typeof setInterval> | undefined, remaining = 0
  const cancel = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; remaining = 0; tick(0) }
  return {
    start() {
      if (timer !== undefined) return
      remaining = 10; tick(remaining)
      timer = setInterval(() => { remaining--; tick(remaining); if (remaining <= 0) { cancel(); run() } }, 1000)
    }, cancel,
  }
}
