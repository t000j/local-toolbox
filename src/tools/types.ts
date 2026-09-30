import type { Component } from 'vue'

export type ToolCategory = 'data' | 'hash' | 'system-network' | 'files' | 'daily'

export interface ToolDefinition {
  id: string
  name: string
  description: string
  category: ToolCategory
  keywords: string[]
  icon: Component
  tone: string
  component: Component
}
