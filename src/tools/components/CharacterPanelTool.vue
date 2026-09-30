<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Clock, Search, Sparkles } from '@lucide/vue'
import { copyText } from '../clipboard'

type CharacterCategory = 'emoji' | 'arrows' | 'math' | 'currency' | 'punctuation' | 'symbols'
interface CharacterItem { value: string; name: string; category: CharacterCategory; keywords: string }

const characters: CharacterItem[] = [
  { value: '😀', name: '开心', category: 'emoji', keywords: '笑脸 微笑 高兴' }, { value: '😃', name: '大笑', category: 'emoji', keywords: '笑脸 开心' },
  { value: '😄', name: '露齿笑', category: 'emoji', keywords: '笑脸 开心' }, { value: '😁', name: '咧嘴笑', category: 'emoji', keywords: '笑脸 开心' },
  { value: '😆', name: '眯眼笑', category: 'emoji', keywords: '笑脸 开心' }, { value: '😅', name: '苦笑', category: 'emoji', keywords: '笑脸 尴尬' },
  { value: '😂', name: '笑哭', category: 'emoji', keywords: '大笑 开心 流泪' }, { value: '🙂', name: '微笑', category: 'emoji', keywords: '笑脸' },
  { value: '😉', name: '眨眼', category: 'emoji', keywords: '笑脸 表情' }, { value: '😊', name: '羞涩微笑', category: 'emoji', keywords: '笑脸 开心' },
  { value: '🥰', name: '爱心笑脸', category: 'emoji', keywords: '喜欢 爱情' }, { value: '😍', name: '花痴', category: 'emoji', keywords: '喜欢 爱心' },
  { value: '😎', name: '墨镜', category: 'emoji', keywords: '酷' }, { value: '🤔', name: '思考', category: 'emoji', keywords: '疑问 想' },
  { value: '😴', name: '睡觉', category: 'emoji', keywords: '困' }, { value: '😭', name: '大哭', category: 'emoji', keywords: '伤心 流泪' },
  { value: '😡', name: '生气', category: 'emoji', keywords: '愤怒' }, { value: '🙏', name: '合十', category: 'emoji', keywords: '感谢 祈祷' },
  { value: '👏', name: '鼓掌', category: 'emoji', keywords: '赞 承认' }, { value: '👍', name: '点赞', category: 'emoji', keywords: '赞 同意' },
  { value: '👎', name: '反对', category: 'emoji', keywords: '不赞成' }, { value: '👌', name: 'OK', category: 'emoji', keywords: '好 可以' },
  { value: '✌️', name: '胜利手势', category: 'emoji', keywords: '耶' }, { value: '🤝', name: '握手', category: 'emoji', keywords: '合作' },
  { value: '💪', name: '肌肉', category: 'emoji', keywords: '力量 加油' }, { value: '❤️', name: '红心', category: 'emoji', keywords: '爱 心形' },
  { value: '💔', name: '心碎', category: 'emoji', keywords: '伤心 心形' }, { value: '💕', name: '双心', category: 'emoji', keywords: '爱情 心形' },
  { value: '🎉', name: '庆祝', category: 'emoji', keywords: '派对 开心' }, { value: '🔥', name: '火焰', category: 'emoji', keywords: '热 火' },
  { value: '⭐', name: '星星', category: 'emoji', keywords: '五角星' }, { value: '🌈', name: '彩虹', category: 'emoji', keywords: '天气' },
  { value: '☀️', name: '太阳', category: 'emoji', keywords: '天气 晴天' }, { value: '🌧️', name: '下雨', category: 'emoji', keywords: '天气' },
  { value: '☕', name: '咖啡', category: 'emoji', keywords: '饮料' }, { value: '🍰', name: '蛋糕', category: 'emoji', keywords: '甜点 食物' },
  { value: '🍎', name: '苹果', category: 'emoji', keywords: '水果 食物' }, { value: '🚀', name: '火箭', category: 'emoji', keywords: '太空' },
  { value: '🚗', name: '汽车', category: 'emoji', keywords: '交通' }, { value: '✈️', name: '飞机', category: 'emoji', keywords: '旅行 交通' },
  { value: '🐱', name: '猫', category: 'emoji', keywords: '动物 宠物' }, { value: '🐶', name: '狗', category: 'emoji', keywords: '动物 宠物' },
  { value: '🐼', name: '熊猫', category: 'emoji', keywords: '动物' }, { value: '🌸', name: '樱花', category: 'emoji', keywords: '花 春天' },
  { value: '🌻', name: '向日葵', category: 'emoji', keywords: '花' }, { value: '🎵', name: '音符', category: 'emoji', keywords: '音乐' },
  { value: '⚽', name: '足球', category: 'emoji', keywords: '运动' }, { value: '🏆', name: '奖杯', category: 'emoji', keywords: '比赛 获胜' },
  { value: '💡', name: '灯泡', category: 'emoji', keywords: '灵感 想法' }, { value: '📌', name: '图钉', category: 'emoji', keywords: '标记' },
  { value: '🔔', name: '铃铛', category: 'emoji', keywords: '提醒' }, { value: '📷', name: '相机', category: 'emoji', keywords: '照片' },
  { value: '📱', name: '手机', category: 'emoji', keywords: '设备' }, { value: '💻', name: '电脑', category: 'emoji', keywords: '设备 笔记本' },
  { value: '🎂', name: '生日蛋糕', category: 'emoji', keywords: '生日 庆祝' }, { value: '🎁', name: '礼物', category: 'emoji', keywords: '送礼' },
  { value: '⏰', name: '闹钟', category: 'emoji', keywords: '时间 提醒' },

  { value: '←', name: '左箭头', category: 'arrows', keywords: '方向 返回' }, { value: '↑', name: '上箭头', category: 'arrows', keywords: '方向' },
  { value: '→', name: '右箭头', category: 'arrows', keywords: '方向 前进' }, { value: '↓', name: '下箭头', category: 'arrows', keywords: '方向' },
  { value: '↔', name: '左右箭头', category: 'arrows', keywords: '方向 双向' }, { value: '↕', name: '上下箭头', category: 'arrows', keywords: '方向 双向' },
  { value: '↖', name: '左上箭头', category: 'arrows', keywords: '方向' }, { value: '↗', name: '右上箭头', category: 'arrows', keywords: '方向' },
  { value: '↘', name: '右下箭头', category: 'arrows', keywords: '方向' }, { value: '↙', name: '左下箭头', category: 'arrows', keywords: '方向' },
  { value: '⇒', name: '双线右箭头', category: 'arrows', keywords: '推导' }, { value: '⇐', name: '双线左箭头', category: 'arrows', keywords: '推导' },
  { value: '⇔', name: '双线双向箭头', category: 'arrows', keywords: '等价' }, { value: '↩', name: '左转箭头', category: 'arrows', keywords: '返回' },
  { value: '↪', name: '右转箭头', category: 'arrows', keywords: '前进' }, { value: '⟲', name: '逆时针箭头', category: 'arrows', keywords: '循环' },
  { value: '⟳', name: '顺时针箭头', category: 'arrows', keywords: '循环' },

  { value: '±', name: '正负号', category: 'math', keywords: '加减' }, { value: '×', name: '乘号', category: 'math', keywords: '乘法' },
  { value: '÷', name: '除号', category: 'math', keywords: '除法' }, { value: '√', name: '平方根', category: 'math', keywords: '根号' },
  { value: '∞', name: '无穷大', category: 'math', keywords: '无限' }, { value: '≈', name: '约等于', category: 'math', keywords: '近似' },
  { value: '≠', name: '不等于', category: 'math', keywords: '比较' }, { value: '≤', name: '小于等于', category: 'math', keywords: '比较' },
  { value: '≥', name: '大于等于', category: 'math', keywords: '比较' }, { value: '∑', name: '求和', category: 'math', keywords: '数学' },
  { value: '∏', name: '连乘', category: 'math', keywords: '数学' }, { value: '∫', name: '积分', category: 'math', keywords: '数学' },
  { value: 'π', name: '圆周率', category: 'math', keywords: '派' }, { value: '∆', name: '增量', category: 'math', keywords: '变化' },
  { value: '°', name: '度数', category: 'math', keywords: '角度 温度' }, { value: '½', name: '二分之一', category: 'math', keywords: '分数' },
  { value: '¼', name: '四分之一', category: 'math', keywords: '分数' }, { value: '¾', name: '四分之三', category: 'math', keywords: '分数' },

  { value: '¥', name: '人民币符号', category: 'currency', keywords: '元 CNY' }, { value: '$', name: '美元符号', category: 'currency', keywords: 'USD' },
  { value: '€', name: '欧元符号', category: 'currency', keywords: 'EUR' }, { value: '£', name: '英镑符号', category: 'currency', keywords: 'GBP' },
  { value: '₩', name: '韩元符号', category: 'currency', keywords: 'KRW' }, { value: '₹', name: '印度卢比符号', category: 'currency', keywords: 'INR' },
  { value: '₽', name: '俄罗斯卢布符号', category: 'currency', keywords: 'RUB' }, { value: '₫', name: '越南盾符号', category: 'currency', keywords: 'VND' },
  { value: '฿', name: '泰铢符号', category: 'currency', keywords: 'THB' }, { value: '₱', name: '比索符号', category: 'currency', keywords: 'PHP' },

  { value: '©', name: '版权符号', category: 'punctuation', keywords: '版权' }, { value: '®', name: '注册商标', category: 'punctuation', keywords: '商标' },
  { value: '™', name: '商标符号', category: 'punctuation', keywords: '品牌' }, { value: '§', name: '章节符号', category: 'punctuation', keywords: '条款' },
  { value: '¶', name: '段落符号', category: 'punctuation', keywords: '段落' }, { value: '•', name: '项目符号', category: 'punctuation', keywords: '列表 圆点' },
  { value: '…', name: '省略号', category: 'punctuation', keywords: '标点' }, { value: '—', name: '长破折号', category: 'punctuation', keywords: '标点' },
  { value: '–', name: '短破折号', category: 'punctuation', keywords: '标点' }, { value: '“', name: '左双引号', category: 'punctuation', keywords: '引号' },
  { value: '”', name: '右双引号', category: 'punctuation', keywords: '引号' }, { value: '℃', name: '摄氏度', category: 'punctuation', keywords: '温度' },
  { value: '℉', name: '华氏度', category: 'punctuation', keywords: '温度' }, { value: '№', name: '序号符号', category: 'punctuation', keywords: '编号' },

  { value: '✓', name: '对勾', category: 'symbols', keywords: '正确 完成' }, { value: '✔', name: '粗对勾', category: 'symbols', keywords: '正确 完成' },
  { value: '✕', name: '叉号', category: 'symbols', keywords: '错误 关闭' }, { value: '☑', name: '勾选框', category: 'symbols', keywords: '复选' },
  { value: '☐', name: '空复选框', category: 'symbols', keywords: '复选' }, { value: '⚠', name: '警告符号', category: 'symbols', keywords: '注意 危险' },
  { value: '♻', name: '回收标志', category: 'symbols', keywords: '环保' }, { value: '♥', name: '黑桃心', category: 'symbols', keywords: '爱心' },
  { value: '♡', name: '白桃心', category: 'symbols', keywords: '爱心' }, { value: '♠', name: '黑桃', category: 'symbols', keywords: '扑克牌' },
  { value: '♣', name: '梅花', category: 'symbols', keywords: '扑克牌' }, { value: '♦', name: '方块', category: 'symbols', keywords: '扑克牌' },
  { value: '♪', name: '八分音符', category: 'symbols', keywords: '音乐' }, { value: '♫', name: '双音符', category: 'symbols', keywords: '音乐' },
  { value: '☮', name: '和平符号', category: 'symbols', keywords: '和平' }, { value: '☯', name: '阴阳', category: 'symbols', keywords: '太极' },
]

const categories: { value: CharacterCategory | 'all'; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'emoji', label: 'Emoji' }, { value: 'arrows', label: '箭头' },
  { value: 'math', label: '数学' }, { value: 'currency', label: '货币' }, { value: 'punctuation', label: '标点' }, { value: 'symbols', label: '其他符号' },
]
const query = ref('')
const category = ref<CharacterCategory | 'all'>('all')
const copiedValue = ref('')
const copyError = ref('')
const recent = ref<string[]>([])

const visibleCharacters = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return characters.filter((item) => {
    const matchesCategory = category.value === 'all' || item.category === category.value
    const matchesQuery = !term || `${item.value} ${item.name} ${item.keywords}`.toLocaleLowerCase().includes(term)
    return matchesCategory && matchesQuery
  })
})
const recentCharacters = computed(() => recent.value.map((value) => characters.find((item) => item.value === value)).filter((item): item is CharacterItem => !!item))

async function copyCharacter(item: CharacterItem): Promise<void> {
  copyError.value = ''
  try {
    await copyText(item.value)
    copiedValue.value = item.value
    recent.value = [item.value, ...recent.value.filter((value) => value !== item.value)].slice(0, 12)
    window.setTimeout(() => { if (copiedValue.value === item.value) copiedValue.value = '' }, 1200)
  } catch {
    copyError.value = '复制失败，请检查剪贴板权限。'
  }
}
</script>

<template>
  <div class="character-panel-tool">
    <div class="character-panel-toolbar">
      <label class="character-search"><Search :size="15" /><input v-model="query" type="search" placeholder="搜索名称或关键词…" aria-label="搜索 Emoji 和特殊字符" /><button v-if="query" class="quiet-button" aria-label="清空搜索" @click="query = ''">×</button></label>
      <span>{{ visibleCharacters.length }} 个</span>
    </div>

    <nav class="character-category-tabs" aria-label="字符分类">
      <button v-for="item in categories" :key="item.value" :class="{ selected: category === item.value }" @click="category = item.value">{{ item.label }}</button>
    </nav>

    <section v-if="!query && category === 'all' && recentCharacters.length" class="character-recent-section">
      <div class="character-section-heading"><Clock :size="13" /><strong>最近复制</strong></div>
      <div class="character-grid character-recent-grid">
        <button v-for="item in recentCharacters" :key="item.value" class="character-card" :title="`${item.name} ${item.value}`" @click="copyCharacter(item)">
          <span class="character-glyph">{{ item.value }}</span><span class="character-label">{{ item.name }}</span><span v-if="copiedValue === item.value" class="character-copied-badge"><Check :size="10" /></span>
        </button>
      </div>
    </section>

    <div v-if="visibleCharacters.length" class="character-grid">
      <button v-for="item in visibleCharacters" :key="`${item.category}-${item.value}`" class="character-card" :class="{ copied: copiedValue === item.value }" :title="`${item.name} ${item.value} · 点击复制`" :aria-label="`复制${item.name}${item.value}`" @click="copyCharacter(item)">
        <span class="character-glyph">{{ item.value }}</span><span class="character-label">{{ item.name }}</span><span v-if="copiedValue === item.value" class="character-copied-badge"><Check :size="10" /></span>
      </button>
    </div>
    <div v-else class="character-empty"><Sparkles :size="23" /><strong>没有找到匹配字符</strong><span>试试名称、符号或更短的关键词。</span></div>

    <p v-if="copyError" class="inline-error">{{ copyError }}</p>
    <p v-else class="character-panel-footnote">点击字符即可复制；内置字符和 Emoji 随应用提供，无需联网。</p>
  </div>
</template>
