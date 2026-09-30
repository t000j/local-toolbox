<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Braces,
  ChevronRight,
  Clock,
  Command,
  FolderOpen,
  Hash,
  Monitor,
  Search,
  Sparkles,
  Star,
  Wrench,
  X,
} from '@lucide/vue'
import { categoryLabels, tools } from './tools/registry'
import type { ToolDefinition } from './tools/types'
import UpdaterPanel from './app/UpdaterPanel.vue'
import { useUpdater } from './app/updater'

const favoriteKey = 'toolbox:favorites:v1'
const query = ref('')
const selectedCategory = ref<'all' | 'favorites' | ToolDefinition['category']>('all')
const activeToolId = ref<string | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const favorites = ref<string[]>(readFavorites())
const updatePanelOpen = ref(false)
const updater = useUpdater()
const { currentVersion, latestVersion, updateAvailable, status: updateStatus } = updater
const dismissedUpdateVersion = ref('')
const updateNoticeVisible = computed(() => updateStatus.value === 'available' && !updatePanelOpen.value && latestVersion.value !== dismissedUpdateVersion.value)
const activeTool = computed(() => tools.find((tool) => tool.id === activeToolId.value) ?? null)

const visibleTools = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return tools.filter((tool) => {
    const matchesCategory =
      selectedCategory.value === 'all' ||
      (selectedCategory.value === 'favorites' ? favorites.value.includes(tool.id) : tool.category === selectedCategory.value)
    const searchable = [tool.name, tool.description, ...tool.keywords].join(' ').toLocaleLowerCase()
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
})

const categoryCount = (category: 'all' | 'favorites' | ToolDefinition['category']) => {
  if (category === 'all') return tools.length
  if (category === 'favorites') return favorites.value.length
  return tools.filter((tool) => tool.category === category).length
}

const navItems = [
  { id: 'all' as const, label: '全部工具', icon: Boxes },
  { id: 'data' as const, label: categoryLabels.data, icon: Braces },
  { id: 'hash' as const, label: categoryLabels.hash, icon: Hash },
  { id: 'system-network' as const, label: categoryLabels['system-network'], icon: Monitor },
  { id: 'files' as const, label: categoryLabels.files, icon: FolderOpen },
  { id: 'daily' as const, label: categoryLabels.daily, icon: Sparkles },
  { id: 'favorites' as const, label: '我的收藏', icon: Star },
]

const pageTitle = computed(() => {
  if (activeTool.value) return activeTool.value.name
  if (selectedCategory.value === 'favorites') return '我的收藏'
  if (selectedCategory.value === 'all') return '全部工具'
  return categoryLabels[selectedCategory.value]
})

watch([updatePanelOpen, latestVersion], ([open, version]) => {
  if (open && version) dismissedUpdateVersion.value = version
})

watch(
  favorites,
  (value) => {
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(value))
    } catch {
      // Local favorites remain usable for the current session if storage is unavailable.
    }
  },
  { deep: true },
)

function readFavorites(): string[] {
  try {
    const stored = localStorage.getItem(favoriteKey)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function chooseCategory(category: typeof selectedCategory.value): void {
  selectedCategory.value = category
  activeToolId.value = null
  query.value = ''
}

function openTool(toolId: string): void {
  activeToolId.value = toolId
}

function closeTool(): void {
  activeToolId.value = null
}

function toggleFavorite(toolId: string): void {
  favorites.value = favorites.value.includes(toolId)
    ? favorites.value.filter((id) => id !== toolId)
    : [...favorites.value, toolId]
}

function onKeydown(event: KeyboardEvent): void {
  if (updatePanelOpen.value) {
    if (event.key === 'Escape' && updater.status.value !== 'installing') updatePanelOpen.value = false
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
  if (event.key === 'Escape' && activeToolId.value) closeTool()
}

onMounted(() => { window.addEventListener('keydown', onKeydown); void updater.initialize() })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); updater.dispose() })
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark"><Command :size="19" stroke-width="2.1" /></div>
        <div>
          <div class="brand-name">LocalToolbox</div>
          <div class="brand-caption">LOCAL TOOLBOX</div>
        </div>
      </div>

      <div class="sidebar-label">工作台</div>
      <nav class="main-nav" aria-label="工具分类">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: selectedCategory === item.id && !activeTool }"
          @click="chooseCategory(item.id)"
        >
          <component :is="item.icon" :size="17" stroke-width="1.8" />
          <span>{{ item.label }}</span>
          <span class="nav-count">{{ categoryCount(item.id) }}</span>
        </button>
      </nav>

      <div class="sidebar-spacer"></div>
      <div class="sidebar-note">
        <div class="note-icon"><Wrench :size="15" /></div>
        <p>常用工具集中管理<br />查找、转换都更顺手</p>
      </div>
      <div class="sidebar-footer">
        <button class="sidebar-update-entry" @click="updatePanelOpen = true">关于与更新<span v-if="updateAvailable" class="sidebar-update-badge">有更新</span></button>
        <button class="version-label sidebar-version-button" :title="updateAvailable ? `发现新版本 ${latestVersion}` : '查看版本和更新设置'" @click="updatePanelOpen = true">v{{ currentVersion }}</button>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumb">
          <span>工具箱</span>
          <ChevronRight v-if="activeTool" :size="14" />
          <span v-if="activeTool" class="breadcrumb-current">{{ activeTool.name }}</span>
        </div>
        <label class="search-box">
          <Search :size="16" />
          <input ref="searchInput" v-model="query" placeholder="搜索工具或功能…" aria-label="搜索工具" />
          <kbd>Ctrl K</kbd>
        </label>
      </header>

      <section v-if="updateNoticeVisible" class="update-notice" aria-label="软件更新提醒">
        <div class="update-notice-icon" aria-hidden="true"><ArrowUpRight :size="20" /></div>
        <div class="update-notice-copy" role="status" aria-live="polite">
          <strong>发现新版本 {{ latestVersion }}</strong><p>查看更新说明，选择是否下载和安装。</p>
        </div>
        <div class="update-notice-actions">
          <button class="primary-button" @click="updatePanelOpen = true">查看更新</button>
          <button class="quiet-button" @click="dismissedUpdateVersion = latestVersion">稍后</button>
          <button class="quiet-button update-notice-close" aria-label="关闭本次启动的更新提醒" @click="dismissedUpdateVersion = latestVersion"><X :size="15" /></button>
        </div>
      </section>

      <section class="content-area">
        <template v-if="!activeTool">
          <div class="welcome-row">
            <div>
              <div class="eyebrow"><Sparkles :size="14" /> 简单、顺手、就在本机</div>
              <h1>{{ pageTitle }}</h1>
            </div>
            <div class="tool-summary">
              <div class="summary-icon"><Boxes :size="18" /></div>
              <div><strong>{{ tools.length }}</strong><span>款内置工具</span></div>
            </div>
          </div>

          <div v-if="selectedCategory === 'all' && !query" class="feature-banner">
            <div class="feature-copy">
              <span class="feature-kicker">快速开始</span>
              <h2>把琐碎操作，变成一步完成。</h2>
              <p>文本处理、设备查看和日常计算，都在一个轻巧的桌面窗口里。</p>
              <button class="feature-button" @click="openTool('json')">
                打开 JSON 工具 <ArrowUpRight :size="15" />
              </button>
            </div>
            <div class="feature-art" aria-hidden="true">
              <div class="art-orbit orbit-one"></div>
              <div class="art-orbit orbit-two"></div>
              <div class="art-tile tile-large"><Braces :size="31" /></div>
              <div class="art-tile tile-small tile-top"><Hash :size="19" /></div>
              <div class="art-tile tile-small tile-bottom"><Clock :size="19" /></div>
              <span class="art-spark spark-one">✳</span>
              <span class="art-spark spark-two">✦</span>
            </div>
          </div>

          <div class="section-heading">
            <div>
              <h2>{{ query ? '搜索结果' : '所有工具' }}</h2>
              <p>{{ visibleTools.length }} 款工具 · 本机处理</p>
            </div>
          </div>

          <div v-if="visibleTools.length" class="tool-grid">
            <article v-for="tool in visibleTools" :key="tool.id" class="tool-card">
              <button class="tool-card-main" @click="openTool(tool.id)">
                <div class="tool-card-top">
                  <div class="tool-icon" :class="'tone-' + tool.tone">
                    <component :is="tool.icon" :size="20" stroke-width="1.8" />
                  </div>
                  <span class="card-arrow"><ArrowUpRight :size="16" /></span>
                </div>
                <h3>{{ tool.name }}</h3>
                <p>{{ tool.description }}</p>
                <span class="tool-category">{{ categoryLabels[tool.category] }}</span>
              </button>
              <button
                class="favorite-button"
                :class="{ favorited: favorites.includes(tool.id) }"
                :aria-label="favorites.includes(tool.id) ? '取消收藏' : '添加收藏'"
                @click="toggleFavorite(tool.id)"
              >
                <Star :size="15" :fill="favorites.includes(tool.id) ? 'currentColor' : 'none'" />
              </button>
            </article>
          </div>
          <div v-else class="empty-state">
            <div class="empty-icon"><Search :size="21" /></div>
            <h3>{{ selectedCategory === 'favorites' ? '还没有收藏工具' : '没有找到匹配工具' }}</h3>
            <p>{{ selectedCategory === 'favorites' ? '点击工具卡片上的星标，常用工具会出现在这里。' : '试试工具名称、类别或更短的关键词。' }}</p>
            <button v-if="query || selectedCategory !== 'all'" class="text-button" @click="chooseCategory('all')">查看全部工具</button>
          </div>
        </template>

        <template v-else>
          <div class="tool-page-heading">
            <button class="back-button" aria-label="返回工具列表" @click="closeTool">
              <ArrowLeft :size="17" />
            </button>
            <div class="tool-page-icon" :class="'tone-' + activeTool.tone">
              <component :is="activeTool.icon" :size="22" stroke-width="1.8" />
            </div>
            <div class="tool-page-title">
              <div class="tool-page-kicker">{{ categoryLabels[activeTool.category] }} <span>·</span> 本机工具</div>
              <h1>{{ activeTool.name }}</h1>
              <p>{{ activeTool.description }}</p>
            </div>
            <button
              class="page-favorite"
              :class="{ favorited: favorites.includes(activeTool.id) }"
              :aria-label="favorites.includes(activeTool.id) ? '取消收藏' : '添加收藏'"
              @click="toggleFavorite(activeTool.id)"
            >
              <Star :size="17" :fill="favorites.includes(activeTool.id) ? 'currentColor' : 'none'" />
              <span>{{ favorites.includes(activeTool.id) ? '已收藏' : '收藏工具' }}</span>
            </button>
          </div>
          <div class="workspace-card">
            <component :is="activeTool.component" :key="activeTool.id" />
          </div>
        </template>
      </section>
    </main>
    <UpdaterPanel :open="updatePanelOpen" @close="updatePanelOpen = false" />
  </div>
</template>
