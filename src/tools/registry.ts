import { ArrowLeftRight, Barcode, Binary, Braces, Calculator as CalculatorIcon, CalendarDays, Camera, Clipboard, ClipboardCopy, ClipboardPaste, ClipboardPlus, Clock, FolderOpen, Globe, Hash, Image as ImageIcon, ListFilter, Minimize2, Monitor, Pencil, Percent, QrCode, Ruler, Search, Server, Sparkles, Timer as TimerIcon, Wifi } from '@lucide/vue'
import { defineAsyncComponent } from 'vue'
import type { ToolDefinition } from './types'
import JsonFormatterTool from './components/JsonFormatterTool.vue'
import JsonPathTool from './components/JsonPathTool.vue'
import JsonDiffTool from './components/JsonDiffTool.vue'
import UuidGeneratorTool from './components/UuidGeneratorTool.vue'
const HashTool = defineAsyncComponent(() => import('./components/HashTool.vue'))
import TimestampTool from './components/TimestampTool.vue'
import UnitConverterTool from './components/UnitConverterTool.vue'
import QrCodeTool from './components/QrCodeTool.vue'
import BarcodeTool from './components/BarcodeTool.vue'
import TextCleanerTool from './components/TextCleanerTool.vue'
import NetworkInfoTool from './components/NetworkInfoTool.vue'
import PortFinderTool from './components/PortFinderTool.vue'
import SystemOverviewTool from './components/SystemOverviewTool.vue'
import BatchRenameTool from './components/BatchRenameTool.vue'
import ImageFormatConverterTool from './components/ImageFormatConverterTool.vue'
import ImageCompressionTool from './components/ImageCompressionTool.vue'
import CalculatorTool from './components/CalculatorTool.vue'
import DateIntervalTool from './components/DateIntervalTool.vue'
import TimeZoneConverterTool from './components/TimeZoneConverterTool.vue'
import WorldClockTool from './components/WorldClockTool.vue'
import StopwatchCountdownTool from './components/StopwatchCountdownTool.vue'
import PriceToolsTool from './components/PriceToolsTool.vue'
import CharacterPanelTool from './components/CharacterPanelTool.vue'
import ClipboardHistoryTool from './components/ClipboardHistoryTool.vue'
import PastePlainTextTool from './components/PastePlainTextTool.vue'
import TextSnippetTool from './components/TextSnippetTool.vue'
import PasteQueueTool from './components/PasteQueueTool.vue'
import RegionScreenshotTool from './components/RegionScreenshotTool.vue'
import ScreenshotAnnotationTool from './components/ScreenshotAnnotationTool.vue'
import ScreenRulerTool from './components/ScreenRulerTool.vue'
import DeviceDriversTool from './components/DeviceDriversTool.vue'
import SettingsBackupTool from './components/SettingsBackupTool.vue'

import WindowControlTool from './components/WindowControlTool.vue'

import WorkspaceLauncherTool from './components/WorkspaceLauncherTool.vue'

import DiskSpaceTool from './components/DiskSpaceTool.vue'

import TempCleanupTool from './components/TempCleanupTool.vue'

import InstalledAppsTool from './components/InstalledAppsTool.vue'

import EventLogTool from './components/EventLogTool.vue'

import BatteryPowerTool from './components/BatteryPowerTool.vue'

import DiagnosticReportTool from './components/DiagnosticReportTool.vue'

import FilePermissionsTool from './components/FilePermissionsTool.vue'

import CertificateViewerTool from './components/CertificateViewerTool.vue'

const SyntheticDataTool = defineAsyncComponent(() => import('./components/SyntheticDataTool.vue'))
const RandomGeneratorTool = defineAsyncComponent(() => import('./components/RandomGeneratorTool.vue'))
const PasswordGeneratorTool = defineAsyncComponent(() => import('./components/PasswordGeneratorTool.vue'))
const JwtViewerTool = defineAsyncComponent(() => import('./components/JwtViewerTool.vue'))
const UnicodeTool = defineAsyncComponent(() => import('./components/UnicodeTool.vue'))
const HtmlEntitiesTool = defineAsyncComponent(() => import('./components/HtmlEntitiesTool.vue'))
const UrlCodecTool = defineAsyncComponent(() => import('./components/UrlCodecTool.vue'))
const Base64Tool = defineAsyncComponent(() => import('./components/Base64Tool.vue'))
const TextDiffTool = defineAsyncComponent(() => import('./components/TextDiffTool.vue'))
const RegexTesterTool = defineAsyncComponent(() => import('./components/RegexTesterTool.vue'))
const MarkdownPreviewTool = defineAsyncComponent(() => import('./components/MarkdownPreviewTool.vue'))
const SqlFormatterTool = defineAsyncComponent(() => import('./components/SqlFormatterTool.vue'))
const CsvViewerTool = defineAsyncComponent(() => import('./components/CsvViewerTool.vue'))
const XmlFormatterTool = defineAsyncComponent(() => import('./components/XmlFormatterTool.vue'))
const YamlFormatterTool = defineAsyncComponent(() => import('./components/YamlFormatterTool.vue'))

// Built-in tools ship with the app; there is no runtime plugin registration.
export const tools: ToolDefinition[] = [
  {
    id: 'synthetic-data',
    name: '测试数据生成器',
    description: '按本地模板生成标明虚构的 JSON、CSV 或 SQLite SQL 样例。',
    category: 'data',
    keywords: ['测试数据', '虚构', 'synthetic', 'mock', '样例', 'json', 'csv', 'sql', '姓名', '邮箱'],
    icon: Sparkles,
    tone: 'green',
    component: SyntheticDataTool,
  },
  {
    id: 'random-generator',
    name: '随机数与字符串',
    description: '按范围、长度与数量生成随机整数或自定义字符池字符串。',
    category: 'data',
    keywords: ['random', '随机数', '随机字符串', '测试数据'],
    icon: Sparkles,
    tone: 'blue',
    component: RandomGeneratorTool,
  },
  {
    id: 'password-generator',
    name: '密码生成器',
    description: '按长度与字符类型，在本机生成安全随机密码。',
    category: 'data',
    keywords: ['密码', 'password', '随机', '安全'],
    icon: Sparkles,
    tone: 'violet',
    component: PasswordGeneratorTool,
  },
  {
    id: 'json',
    name: 'JSON 格式化',
    description: '格式化、压缩 JSON，并快速定位语法错误。',
    category: 'data',
    keywords: ['json', '格式化', '压缩', '校验', '开发'],
    icon: Braces,
    tone: 'violet',
    component: JsonFormatterTool,
  },
  {
    id: 'json-diff',
    name: 'JSON 差异比较',
    description: '对比两份 JSON，按路径查看新增、删除和修改项。',
    category: 'data',
    keywords: ['json diff', 'json compare', 'json比较', '差异', '新增', '删除', '修改'],
    icon: ArrowLeftRight,
    tone: 'violet',
    component: JsonDiffTool,
  },
  {
    id: 'jsonpath',
    name: 'JSONPath 查询器',
    description: '用路径和筛选表达式提取 JSON 数据，查看命中位置与值。',
    category: 'data',
    keywords: ['jsonpath', 'JSON 查询', '路径查询', '字段提取', '筛选表达式', '数组', 'RFC 9535'],
    icon: Search,
    tone: 'blue',
    component: JsonPathTool,
  },
  {
    id: 'xml',
    name: 'XML 格式化与校验',
    description: '本地校验 XML 结构并整理缩进，保留混合文本。',
    category: 'data',
    keywords: ['xml', '格式化', '结构校验', '缩进'],
    icon: Braces,
    tone: 'violet',
    component: XmlFormatterTool,
  },
  {
    id: 'yaml',
    name: 'YAML 格式化与校验',
    description: '校验并格式化 YAML 1.2，安全互转 JSON。',
    category: 'data',
    keywords: ['yaml', 'yml', 'json', '格式化', '缩进', '校验', '转换'],
    icon: Braces,
    tone: 'blue',
    component: YamlFormatterTool,
  },
  {
    id: 'csv',
    name: 'CSV 表格查看器',
    description: '读取本地 CSV，分页筛选并导出 JSON。',
    category: 'data',
    keywords: ['csv', 'tsv', '表格', '分隔符', '筛选', 'json', '导出'],
    icon: ListFilter,
    tone: 'green',
    component: CsvViewerTool,
  },
  {
    id: 'sql',
    name: 'SQL 格式化器',
    description: '按 SQL 方言整理缩进与关键字大小写，不执行语句。',
    category: 'data',
    keywords: ['sql', 'mysql', 'postgresql', 'sqlite', '格式化', '数据库'],
    icon: Braces,
    tone: 'blue',
    component: SqlFormatterTool,
  },
  {
    id: 'markdown',
    name: 'Markdown 预览器',
    description: '本机编辑 Markdown 并安全预览，可复制净化后的 HTML。',
    category: 'data',
    keywords: ['markdown', 'md', '预览', '编辑', 'html'],
    icon: Pencil,
    tone: 'violet',
    component: MarkdownPreviewTool,
  },
  {
    id: 'regex',
    name: '正则表达式测试器',
    description: '测试 JavaScript 正则匹配，查看位置与捕获组，支持超时取消。',
    category: 'data',
    keywords: ['regex', 'regexp', '正则', '表达式', '匹配', '捕获组'],
    icon: Search,
    tone: 'green',
    component: RegexTesterTool,
  },
  {
    id: 'text-diff',
    name: '文本差异比较',
    description: '逐行比较两段文本，标出新增和删除，分页查看变化。',
    category: 'data',
    keywords: ['text diff', '文本', '差异', '比较', '变化行'],
    icon: ArrowLeftRight,
    tone: 'violet',
    component: TextDiffTool,
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '本地完成文本或文件的 Base64 编解码，支持二进制保存。',
    category: 'data',
    keywords: ['base64', '编码', '解码', '文本', '文件', '二进制'],
    icon: Binary,
    tone: 'blue',
    component: Base64Tool,
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    description: '转换 URL 参数、完整 URI 或表单字段，明确区分加号与空格。',
    category: 'data',
    keywords: ['url', 'uri', '编码', '解码', '百分号', '参数', '表单'],
    icon: Globe,
    tone: 'blue',
    component: UrlCodecTool,
  },
  {
    id: 'html-entities',
    name: 'HTML 实体编解码',
    description: '转换常见命名实体和 Unicode 数字实体，结果仅作为纯文本显示。',
    category: 'data',
    keywords: ['html', '实体', '编码', '解码', '转义', '特殊字符'],
    icon: Braces,
    tone: 'blue',
    component: HtmlEntitiesTool,
  },
  {
    id: 'unicode',
    name: 'Unicode 查看与转义',
    description: '按码点查看字符与 UTF-16 码元，转换字面 Unicode 转义。',
    category: 'data',
    keywords: ['unicode', '码点', 'utf16', '编码', '解码', '转义', '字符'],
    icon: Binary,
    tone: 'violet',
    component: UnicodeTool,
  },
  {
    id: 'jwt-viewer',
    name: 'JWT 内容查看器',
    description: '本机解码 Header 和 Payload；不验证签名，不保存令牌。',
    category: 'data',
    keywords: ['jwt', 'token', 'header', 'payload', '令牌', '解码'],
    icon: Braces,
    tone: 'amber',
    component: JwtViewerTool,
  },
  {
    id: 'uuid',
    name: 'UUID 生成器',
    description: '按需批量生成随机 UUID v4 并复制使用。',
    category: 'data',
    keywords: ['uuid', 'guid', '唯一标识', '随机标识', '测试数据', '生成'],
    icon: Binary,
    tone: 'blue',
    component: UuidGeneratorTool,
  },
  {
    id: 'hash',
    name: '哈希摘要',
    description: '计算文本或本地文件的 MD5、SHA-1 或 SHA-2 摘要。',
    category: 'hash',
    keywords: ['hash', 'md5', 'sha', '摘要', '校验', '单向', '文件'],
    icon: Hash,
    tone: 'amber',
    component: HashTool,
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    description: '在本地日期时间与 Unix 时间戳之间转换。',
    category: 'daily',
    keywords: ['时间戳', 'unix', '日期', '时间', '转换'],
    icon: Clock,
    tone: 'green',
    component: TimestampTool,
  },
  {
    id: 'units',
    name: '单位换算',
    description: '长度、质量、面积、温度和数据容量随手换算。',
    category: 'daily',
    keywords: ['单位', '换算', '长度', '温度', '重量', '容量', '速度'],
    icon: ArrowLeftRight,
    tone: 'blue',
    component: UnitConverterTool,
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '进行四则运算和括号计算，并查看本次会话历史。',
    category: 'daily',
    keywords: ['计算器', '加减乘除', '四则运算', '括号', '小数', '历史记录'],
    icon: CalculatorIcon,
    tone: 'violet',
    component: CalculatorTool,
  },
  {
    id: 'date-interval',
    name: '日期间隔计算器',
    description: '计算日期间隔、首尾日历天数和工作日。',
    category: 'daily',
    keywords: ['日期间隔', '相差几天', '工作日', '日历天数', '日期计算'],
    icon: CalendarDays,
    tone: 'green',
    component: DateIntervalTool,
  },
  {
    id: 'timezone-converter',
    name: '时区换算器',
    description: '按本机时区规则换算指定日期时间，处理夏令时边界。',
    category: 'daily',
    keywords: ['时区', '时间换算', 'UTC', '夏令时', '跨时区', '世界时间'],
    icon: Globe,
    tone: 'blue',
    component: TimeZoneConverterTool,
  },
  {
    id: 'world-clock',
    name: '世界时钟',
    description: '同时查看多个城市的本地时间与日期。',
    category: 'daily',
    keywords: ['世界时钟', '城市时间', '本地时间', '时差', '时区'],
    icon: Globe,
    tone: 'blue',
    component: WorldClockTool,
  },
  {
    id: 'stopwatch-countdown',
    name: '秒表与倒计时',
    description: '记录分段用时或设置本机倒计时。',
    category: 'daily',
    keywords: ['秒表', '计时器', '倒计时', '计次', '分段用时', '提醒'],
    icon: TimerIcon,
    tone: 'green',
    component: StopwatchCountdownTool,
  },
  {
    id: 'price-tools',
    name: '折扣、税额与分摊',
    description: '计算折后价、含税金额和多人分摊金额。',
    category: 'daily',
    keywords: ['折扣', '优惠', '折后价', '税额', '税率', '分摊', 'AA', '多人付款'],
    icon: Percent,
    tone: 'green',
    component: PriceToolsTool,
  },
  {
    id: 'character-panel',
    name: 'Emoji 与特殊字符',
    description: '分类查找常用 Emoji、箭头、数学和货币符号并复制。',
    category: 'daily',
    keywords: ['emoji', '表情', '特殊字符', '符号', '箭头', '数学符号', '货币', '标点', '复制'],
    icon: Sparkles,
    tone: 'amber',
    component: CharacterPanelTool,
  },
  {
    id: 'clipboard-history',
    name: '剪贴板历史',
    description: '开启后本机记录近期复制的文本和图片，可搜索、复制与清理。',
    category: 'daily',
    keywords: ['剪贴板', '复制历史', '粘贴', '文本历史', '图片历史', 'clipboard'],
    icon: Clipboard,
    tone: 'violet',
    component: ClipboardHistoryTool,
  },
  {
    id: 'paste-plain-text',
    name: '粘贴为纯文本',
    description: '预览剪贴板文字后写回纯文本，去除原有富文本格式。',
    category: 'daily',
    keywords: ['纯文本', '粘贴', '剪贴板', '去格式', '富文本', 'paste as plain text'],
    icon: ClipboardPaste,
    tone: 'blue',
    component: PastePlainTextTool,
  },
  {
    id: 'text-snippets',
    name: '文本片段管理器',
    description: '保存常用回复、地址和代码片段，搜索后即可复制。',
    category: 'daily',
    keywords: ['文本片段', '常用短语', '常用回复', '模板', '快速复制', 'snippet'],
    icon: ClipboardPlus,
    tone: 'amber',
    component: TextSnippetTool,
  },
  {
    id: 'paste-queue',
    name: '多项粘贴队列',
    description: '整理多条文本，按顺序逐项复制到剪贴板。',
    category: 'daily',
    keywords: ['多项粘贴', '粘贴队列', '批量复制', '顺序复制', 'paste queue'],
    icon: ClipboardCopy,
    tone: 'blue',
    component: PasteQueueTool,
  },
  {
    id: 'region-screenshot',
    name: '区域截图',
    description: '选择屏幕或窗口后框选区域，可复制或保存为 PNG。',
    category: 'daily',
    keywords: ['截图', '截屏', '区域截图', 'screen capture', '屏幕区域', '保存图片'],
    icon: Camera,
    tone: 'blue',
    component: RegionScreenshotTool,
  },
  {
    id: 'screenshot-annotation',
    name: '截图标注',
    description: '在本地图片或屏幕截图上添加箭头、画笔和文字。',
    category: 'daily',
    keywords: ['截图标注', '箭头', '画笔', '图片注释', '文字标记', 'annotation'],
    icon: Pencil,
    tone: 'amber',
    component: ScreenshotAnnotationTool,
  },
  {
    id: 'screen-ruler',
    name: '屏幕标尺',
    description: '在屏幕或窗口画面上拖动测量线，读取像素距离。',
    category: 'daily',
    keywords: ['屏幕标尺', '像素距离', '屏幕测量', '间距', '角度', 'ruler'],
    icon: Ruler,
    tone: 'violet',
    component: ScreenRulerTool,
  },
  {
    id: 'qrcode',
    name: '二维码生成',
    description: '将文字或链接生成二维码图片并保存到本地。',
    category: 'daily',
    keywords: ['二维码', '扫码', '链接', '分享'],
    icon: QrCode,
    tone: 'green',
    component: QrCodeTool,
  },
  {
    id: 'barcode',
    name: '条形码生成',
    description: '生成商品码和通用条码，支持 PNG 与 SVG 保存。',
    category: 'daily',
    keywords: ['条形码', '条码', 'barcode', 'EAN-13', 'EAN-8', 'UPC-A', 'CODE128', 'CODE39', '商品码'],
    icon: Barcode,
    tone: 'amber',
    component: BarcodeTool,
  },
  {
    id: 'text-cleaner',
    name: '文本清理器',
    description: '清理空白、重复行和换行格式，实时预览整理结果。',
    category: 'daily',
    keywords: ['文本', '清理', '空格', '空行', '去重', '排序', '换行', '整理'],
    icon: ListFilter,
    tone: 'blue',
    component: TextCleanerTool,
  },
  {
    id: 'network-info',
    name: '本机网络信息',
    description: '查看网络适配器、IP 地址、网关和 DNS 配置。',
    category: 'system-network',
    keywords: ['IP', '网卡', '网关', 'DNS', 'Wi-Fi', '网络配置', 'ipconfig'],
    icon: Wifi,
    tone: 'blue',
    component: NetworkInfoTool,
  },
  {
    id: 'port-finder',
    name: '端口占用查询',
    description: '查看 TCP 端口对应的本机地址、连接状态和进程。',
    category: 'system-network',
    keywords: ['端口', '8080', 'PID', '进程', 'TCP', 'netstat'],
    icon: Server,
    tone: 'violet',
    component: PortFinderTool,
  },
  {
    id: 'system-overview',
    name: '系统与设备概览',
    description: '查看 Windows 版本、处理器、内存和运行时间。',
    category: 'system-network',
    keywords: ['电脑信息', '系统版本', 'CPU', '处理器', '内存', '设备', '运行时间'],
    icon: Monitor,
    tone: 'violet',
    component: SystemOverviewTool,
  },
  {
    id: 'batch-rename',
    name: '批量重命名',
    description: '为多个本地文件添加前后缀或替换名称，支持预览和撤销。',
    category: 'files',
    keywords: ['批量重命名', '文件改名', '添加前缀', '添加后缀', '查找替换', '文件名'],
    icon: FolderOpen,
    tone: 'blue',
    component: BatchRenameTool,
  },
  {
    id: 'image-format',
    name: '图片格式转换',
    description: '在本机转换 PNG、JPG 和 WebP 图片格式，可调整压缩质量。',
    category: 'files',
    keywords: ['图片', '图像', '格式转换', 'PNG', 'JPG', 'JPEG', 'WebP', '压缩质量'],
    icon: ImageIcon,
    tone: 'green',
    component: ImageFormatConverterTool,
  },
  {
    id: 'image-compression',
    name: '图片压缩',
    description: '预览 JPG 质量压缩或 PNG 无损优化的文件体积变化。',
    category: 'files',
    keywords: ['图片压缩', '图像压缩', 'JPEG 质量', 'PNG 优化', '减小图片', '压缩率'],
    icon: Minimize2,
    tone: 'green',
    component: ImageCompressionTool,
  },
  {
    id: 'window-control',
    name: '窗口置顶与快速控制',
    description: '查看桌面窗口，执行置顶、最小化、最大化和关闭请求。',
    category: 'system-network',
    keywords: ["置顶","窗口","最小化","最大化","关闭窗口"],
    icon: Monitor,
    tone: 'violet',
    component: WindowControlTool,
  },
  {
    id: 'workspace-launcher',
    name: '工作区快捷启动',
    description: '保存一组应用和文件夹，按需一键打开工作区。',
    category: 'daily',
    keywords: ["工作区","快捷启动","应用启动","文件夹"],
    icon: FolderOpen,
    tone: 'blue',
    component: WorkspaceLauncherTool,
  },
  {
    id: 'disk-space',
    name: '磁盘空间分析器',
    description: '查看磁盘容量和文件夹占用，定位大文件。',
    category: 'files',
    keywords: ["磁盘空间","目录占用","大文件","容量"],
    icon: Minimize2,
    tone: 'blue',
    component: DiskSpaceTool,
  },
  {
    id: 'temp-cleanup',
    name: '临时文件清理',
    description: '预览过期用户临时文件，选择并确认后清理。',
    category: 'system-network',
    keywords: ["临时文件","清理","Temp","释放空间"],
    icon: Sparkles,
    tone: 'amber',
    component: TempCleanupTool,
  },
  {
    id: 'installed-apps',
    name: '已安装应用查看器',
    description: '搜索本机登记的软件和商店应用，查看版本与发布者。',
    category: 'system-network',
    keywords: ["已安装软件","应用","版本","发布者","安装位置"],
    icon: Monitor,
    tone: 'blue',
    component: InstalledAppsTool,
  },
  {
    id: 'event-logs',
    name: 'Windows 事件日志筛选器',
    description: '按日志、时间、级别和来源查看本机事件。',
    category: 'system-network',
    keywords: ["事件日志","Windows","错误","警告","Event Viewer"],
    icon: Clock,
    tone: 'amber',
    component: EventLogTool,
  },
  {
    id: 'battery-power',
    name: '电池与电源报告',
    description: '查看电池电量、容量、电源状态并导出 Windows 报告。',
    category: 'system-network',
    keywords: ["电池","电量","电源计划","满充容量","battery report"],
    icon: Percent,
    tone: 'green',
    component: BatteryPowerTool,
  },
  {
    id: 'diagnostic-report',
    name: '系统诊断报告',
    description: '汇总本机系统与磁盘信息，预览后导出 JSON 或文本。',
    category: 'system-network',
    keywords: ["系统诊断","报告","设备信息","导出"],
    icon: Braces,
    tone: 'blue',
    component: DiagnosticReportTool,
  },
  {
    id: 'file-permissions',
    name: '文件权限查看器',
    description: '查看文件或目录的所有者、权限规则和继承状态。',
    category: 'system-network',
    keywords: ["文件权限","ACL","账户","继承","所有者"],
    icon: Hash,
    tone: 'violet',
    component: FilePermissionsTool,
  },
  {
    id: 'certificate-viewer',
    name: '证书查看器',
    description: '查看本机证书主题、颁发者、指纹和有效期。',
    category: 'system-network',
    keywords: ["证书","指纹","有效期","SSL","根证书"],
    icon: Hash,
    tone: 'green',
    component: CertificateViewerTool,
  },
  {
    id: 'device-drivers',
    name: '设备与驱动清单',
    description: '查看本机设备状态、驱动版本与提供商，筛选并复制详情。',
    category: 'system-network',
    keywords: ['设备', '驱动', '驱动版本', '设备管理器', '硬件', 'PnP', 'device manager'],
    icon: Monitor,
    tone: 'blue',
    component: DeviceDriversTool,
  },
  {
    id: 'settings-backup',
    name: '设置备份与恢复',
    description: '按分组备份收藏和本机设置，预览后确认恢复。',
    category: 'daily',
    keywords: ['设置', '备份', '恢复', '导出配置', '收藏', '文本片段', '工作区', 'backup'],
    icon: FolderOpen,
    tone: 'violet',
    component: SettingsBackupTool,
  },
]

export const categoryLabels: Record<ToolDefinition['category'], string> = {
  data: '文本与数据',
  hash: '哈希与校验',
  'system-network': '系统与网络',
  files: '文件与媒体',
  daily: '日常效率',
}
