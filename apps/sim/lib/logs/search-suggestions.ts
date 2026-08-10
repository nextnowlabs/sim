import type { Suggestion, SuggestionGroup } from '@/app/workspace/[workspaceId]/logs/types'

export interface FilterDefinition {
  key: string
  label: string
  description: string
  options: Array<{
    value: string
    label: string
    description?: string
  }>
  acceptsCustomValue?: boolean
  customValueHint?: string
}

export interface WorkflowData {
  id: string
  name: string
  description?: string
}

export interface FolderData {
  id: string
  name: string
}

export interface TriggerData {
  value: string
  label: string
  color: string
}

/**
 * Generates current date examples for the date filter options.
 */
function getDateExamples() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const firstOfMonth = `${year}-${month}-01`
  const today = `${year}-${month}-${day}`
  const yearMonth = `${year}-${month}`
  return { today, firstOfMonth, year: String(year), yearMonth }
}

export const FILTER_DEFINITIONS: FilterDefinition[] = [
  {
    key: 'level',
    label: '状态',
    description: '按日志级别筛选',
    options: [
      { value: 'error', label: '错误', description: '仅错误日志' },
      { value: 'info', label: '信息', description: '仅信息日志' },
    ],
  },
  {
    key: 'cost',
    label: '费用',
    description: '按运行费用筛选',
    options: [
      {
        value: '>0.01',
        label: '超过 2 积分',
        description: '运行消耗超过 2 积分',
      },
      {
        value: '<0.005',
        label: '低于 1 积分',
        description: '运行消耗少于 1 积分',
      },
      {
        value: '>0.05',
        label: '超过 10 积分',
        description: '运行消耗超过 10 积分',
      },
      { value: '=0', label: 'Free', description: '免费套餐的运行' },
      { value: '>0', label: '付费', description: '有费用的运行' },
    ],
  },
  {
    key: 'date',
    label: '日期',
    description: '按日期范围筛选',
    options: (() => {
      const { today, firstOfMonth, year, yearMonth } = getDateExamples()
      return [
        { value: 'today', label: '今天', description: '今天的日志' },
        { value: 'yesterday', label: '昨天', description: '昨天的日志' },
        { value: 'this-week', label: '本周', description: '本周的日志' },
        { value: 'last-week', label: '上周', description: '上周的日志' },
        { value: 'this-month', label: '本月', description: '本月的日志' },
        { value: today, label: '指定日期', description: 'YYYY-MM-DD' },
        { value: yearMonth, label: '指定月份', description: 'YYYY-MM' },
        { value: year, label: '指定年份', description: 'YYYY' },
        {
          value: `${firstOfMonth}..${today}`,
          label: '日期范围',
          description: 'YYYY-MM-DD..YYYY-MM-DD',
        },
      ]
    })(),
  },
  {
    key: 'duration',
    label: '时长',
    description: '按运行时长筛选',
    options: [
      { value: '>5s', label: '超过 5 秒', description: '运行时长超过 5 秒' },
      { value: '<1s', label: '低于 1 秒', description: '运行时长少于 1 秒' },
      { value: '>10s', label: '超过 10 秒', description: '运行时长超过 10 秒' },
      { value: '>30s', label: '超过 30 秒', description: '运行时长超过 30 秒' },
      { value: '<500ms', label: '低于 0.5 秒', description: '非常快的运行' },
    ],
  },
]

export class SearchSuggestions {
  private workflowsData: WorkflowData[]
  private foldersData: FolderData[]
  private triggersData: TriggerData[]

  constructor(
    workflowsData: WorkflowData[] = [],
    foldersData: FolderData[] = [],
    triggersData: TriggerData[] = []
  ) {
    this.workflowsData = workflowsData
    this.foldersData = foldersData
    this.triggersData = triggersData
  }

  updateData(
    workflowsData: WorkflowData[] = [],
    foldersData: FolderData[] = [],
    triggersData: TriggerData[] = []
  ) {
    this.workflowsData = workflowsData
    this.foldersData = foldersData
    this.triggersData = triggersData
  }

  /**
   * Get all triggers from registry data
   */
  private getAllTriggers(): TriggerData[] {
    return this.triggersData
  }

  /**
   * Get suggestions based ONLY on current input (no cursor position!)
   */
  getSuggestions(input: string): SuggestionGroup | null {
    const trimmed = input.trim()

    if (!trimmed) {
      return this.getFilterKeysList()
    }

    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1)
      return this.getFilterValues(key)
    }

    if (trimmed.includes(':')) {
      const [key, partial] = trimmed.split(':')
      return this.getFilterValues(key, partial)
    }

    return this.getMultiSectionResults(trimmed)
  }

  /**
   * Get filter keys list (empty input state)
   */
  private getFilterKeysList(): SuggestionGroup {
    const suggestions: Suggestion[] = []

    for (const filter of FILTER_DEFINITIONS) {
      suggestions.push({
        id: `filter-key-${filter.key}`,
        value: `${filter.key}:`,
        label: filter.label,
        description: filter.description,
        category: 'filters',
      })
    }

    suggestions.push({
      id: 'filter-key-trigger',
      value: 'trigger:',
      label: '触发器',
      description: '按触发器类型筛选',
      category: 'filters',
    })

    if (this.workflowsData.length > 0) {
      suggestions.push({
        id: 'filter-key-workflow',
        value: 'workflow:',
        label: '工作流',
        description: '按工作流名称筛选',
        category: 'filters',
      })
    }

    if (this.foldersData.length > 0) {
      suggestions.push({
        id: 'filter-key-folder',
        value: 'folder:',
        label: '文件夹',
        description: '按文件夹名称筛选',
        category: 'filters',
      })
    }

    suggestions.push({
      id: 'filter-key-workflowId',
      value: 'workflowId:',
      label: '工作流 ID',
      description: '按工作流 ID 筛选',
      category: 'filters',
    })

    suggestions.push({
      id: 'filter-key-executionId',
      value: 'executionId:',
      label: '运行 ID',
      description: '按运行 ID 筛选',
      category: 'filters',
    })

    return {
      type: 'filter-keys',
      suggestions,
    }
  }

  /**
   * Get filter values for a specific key
   */
  private getFilterValues(key: string, partial = ''): SuggestionGroup | null {
    const filterDef = FILTER_DEFINITIONS.find((f) => f.key === key)

    if (filterDef) {
      const suggestions: Suggestion[] = filterDef.options
        .filter(
          (opt) =>
            !partial ||
            opt.value.toLowerCase().includes(partial.toLowerCase()) ||
            opt.label.toLowerCase().includes(partial.toLowerCase())
        )
        .map((opt) => ({
          id: `filter-value-${key}-${opt.value}`,
          value: `${key}:${opt.value}`,
          label: opt.label,
          description: opt.description,
          category: key as Suggestion['category'],
        }))

      // Handle custom date input
      if (key === 'date' && partial) {
        const dateSuggestions = this.getDateSuggestions(partial)
        if (dateSuggestions.length > 0) {
          suggestions.unshift(...dateSuggestions)
        }
      }

      return suggestions.length > 0
        ? {
            type: 'filter-values',
            filterKey: key,
            suggestions,
          }
        : null
    }

    if (key === 'trigger') {
      const allTriggers = this.getAllTriggers()
      const suggestions = allTriggers
        .filter((t) => !partial || t.label.toLowerCase().includes(partial.toLowerCase()))
        .map((t) => ({
          id: `filter-value-trigger-${t.value}`,
          value: `trigger:${t.value}`,
          label: t.label,
          description: `${t.label}-triggered runs`,
          category: 'trigger' as const,
          color: t.color,
        }))

      return suggestions.length > 0
        ? {
            type: 'filter-values',
            filterKey: 'trigger',
            suggestions,
          }
        : null
    }

    if (key === 'workflow') {
      const suggestions = this.workflowsData
        .filter((w) => !partial || w.name.toLowerCase().includes(partial.toLowerCase()))
        .map((w) => ({
          id: `filter-value-workflow-${w.id}`,
          value: `workflow:"${w.name}"`,
          label: w.name,
          description: w.description,
          category: 'workflow' as const,
        }))

      return suggestions.length > 0
        ? {
            type: 'filter-values',
            filterKey: 'workflow',
            suggestions,
          }
        : null
    }

    if (key === 'folder') {
      const suggestions = this.foldersData
        .filter((f) => !partial || f.name.toLowerCase().includes(partial.toLowerCase()))
        .map((f) => ({
          id: `filter-value-folder-${f.id}`,
          value: `folder:"${f.name}"`,
          label: f.name,
          category: 'folder' as const,
        }))

      return suggestions.length > 0
        ? {
            type: 'filter-values',
            filterKey: 'folder',
            suggestions,
          }
        : null
    }

    return null
  }

  /**
   * Get multi-section results for plain text
   */
  private getMultiSectionResults(query: string): SuggestionGroup | null {
    const sections: Array<{ title: string; suggestions: Suggestion[] }> = []
    const allSuggestions: Suggestion[] = []

    const showAllSuggestion: Suggestion = {
      id: 'show-all',
      value: query,
      label: `Show all results for "${query}"`,
      category: 'show-all',
    }
    allSuggestions.push(showAllSuggestion)

    const matchingFilterValues = this.getMatchingFilterValues(query)
    if (matchingFilterValues.length > 0) {
      sections.push({
        title: '建议筛选',
        suggestions: matchingFilterValues,
      })
      allSuggestions.push(...matchingFilterValues)
    }

    const matchingTriggers = this.getMatchingTriggers(query)
    if (matchingTriggers.length > 0) {
      sections.push({
        title: '触发器',
        suggestions: matchingTriggers,
      })
      allSuggestions.push(...matchingTriggers)
    }

    const matchingWorkflows = this.getMatchingWorkflows(query)
    if (matchingWorkflows.length > 0) {
      sections.push({
        title: '工作流',
        suggestions: matchingWorkflows,
      })
      allSuggestions.push(...matchingWorkflows)
    }

    const matchingFolders = this.getMatchingFolders(query)
    if (matchingFolders.length > 0) {
      sections.push({
        title: '文件夹',
        suggestions: matchingFolders,
      })
      allSuggestions.push(...matchingFolders)
    }

    if (
      matchingFilterValues.length === 0 &&
      matchingTriggers.length === 0 &&
      matchingWorkflows.length === 0 &&
      matchingFolders.length === 0
    ) {
      const filterKeys = this.getFilterKeysList()
      if (filterKeys.suggestions.length > 0) {
        sections.push({
          title: '建议筛选',
          suggestions: filterKeys.suggestions.slice(0, 5),
        })
        allSuggestions.push(...filterKeys.suggestions.slice(0, 5))
      }
    }

    return allSuggestions.length > 0
      ? {
          type: 'multi-section',
          suggestions: allSuggestions,
          sections,
        }
      : null
  }

  /**
   * Get suggestions for custom date input
   */
  private getDateSuggestions(partial: string): Suggestion[] {
    const suggestions: Suggestion[] = []

    // Pattern for year only: YYYY
    const yearPattern = /^\d{4}$/
    // Pattern for month only: YYYY-MM
    const monthPattern = /^\d{4}-\d{2}$/
    // Pattern for full date: YYYY-MM-DD
    const fullDatePattern = /^\d{4}-\d{2}-\d{2}$/
    // Pattern for partial date being typed
    const partialDatePattern = /^\d{4}(-\d{0,2})?(-\d{0,2})?$/
    // Pattern for date range: YYYY-MM-DD..YYYY-MM-DD (complete or partial)
    const rangePattern = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
    const partialRangePattern = /^(\d{4}-\d{2}-\d{2})\.\.?$/

    // Check if it's a complete date range
    if (rangePattern.test(partial)) {
      const [startDate, endDate] = partial.split('..')
      suggestions.push({
        id: `date-range-${partial}`,
        value: `date:${partial}`,
        label: `${this.formatDateLabel(startDate)} 至 ${this.formatDateLabel(endDate)}`,
        description: '自定义日期范围',
        category: 'date',
      })
      return suggestions
    }

    // Check if it's a partial date range (has ..)
    if (partialRangePattern.test(partial)) {
      const startDate = partial.replace(/\.+$/, '')
      suggestions.push({
        id: `date-range-hint-${partial}`,
        value: `date:${startDate}..`,
        label: `${this.formatDateLabel(startDate)} 至 ...`,
        description: '输入结束日期(YYYY-MM-DD)',
        category: 'date',
      })
      return suggestions
    }

    // Check if it's a year only (YYYY)
    if (yearPattern.test(partial)) {
      suggestions.push({
        id: `date-year-${partial}`,
        value: `date:${partial}`,
        label: `${partial} 年`,
        description: '本年度的全部日志',
        category: 'date',
      })
      return suggestions
    }

    // Check if it's a month only (YYYY-MM)
    if (monthPattern.test(partial)) {
      const [year, month] = partial.split('-')
      const monthNames = [
        '1月',
        '2月',
        '3月',
        '4月',
        '5月',
        '6月',
        '7月',
        '8月',
        '9月',
        '10月',
        '11月',
        '12月',
      ]
      const monthName = monthNames[Number.parseInt(month, 10) - 1] || month
      suggestions.push({
        id: `date-month-${partial}`,
        value: `date:${partial}`,
        label: `${year}年${monthName}`,
        description: '本月度的全部日志',
        category: 'date',
      })
      return suggestions
    }

    // Check if it's a complete single date
    if (fullDatePattern.test(partial)) {
      const date = new Date(partial)
      if (!Number.isNaN(date.getTime())) {
        suggestions.push({
          id: `date-single-${partial}`,
          value: `date:${partial}`,
          label: this.formatDateLabel(partial),
          description: '单个日期',
          category: 'date',
        })
        // Also suggest starting a range
        suggestions.push({
          id: `date-range-start-${partial}`,
          value: `date:${partial}..`,
          label: `${this.formatDateLabel(partial)} to ...`,
          description: '开始日期范围',
          category: 'date',
        })
      }
      return suggestions
    }

    // Check if user is typing a date pattern
    if (partialDatePattern.test(partial) && partial.length >= 4) {
      suggestions.push({
        id: 'date-custom-hint',
        value: `date:${partial}`,
        label: partial,
        description: '继续输入:YYYY、YYYY-MM 或 YYYY-MM-DD',
        category: 'date',
      })
    }

    return suggestions
  }

  /**
   * Format a date string for display
   */
  private formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  /**
   * Match filter values across all definitions
   */
  private getMatchingFilterValues(query: string): Suggestion[] {
    if (!query.trim()) return []

    const matches: Suggestion[] = []
    const lowerQuery = query.toLowerCase()

    for (const filterDef of FILTER_DEFINITIONS) {
      for (const option of filterDef.options) {
        if (
          option.value.toLowerCase().includes(lowerQuery) ||
          option.label.toLowerCase().includes(lowerQuery)
        ) {
          matches.push({
            id: `filter-match-${filterDef.key}-${option.value}`,
            value: `${filterDef.key}:${option.value}`,
            label: `${filterDef.label}: ${option.label}`,
            description: option.description,
            category: filterDef.key as any,
          })
        }
      }
    }

    return matches.slice(0, 5)
  }

  /**
   * Match triggers by label (core + integrations)
   */
  private getMatchingTriggers(query: string): Suggestion[] {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()
    const allTriggers = this.getAllTriggers()

    const matches = allTriggers
      .filter((trigger) => trigger.label.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aLabel = a.label.toLowerCase()
        const bLabel = b.label.toLowerCase()

        if (aLabel === lowerQuery) return -1
        if (bLabel === lowerQuery) return 1
        if (aLabel.startsWith(lowerQuery) && !bLabel.startsWith(lowerQuery)) return -1
        if (bLabel.startsWith(lowerQuery) && !aLabel.startsWith(lowerQuery)) return 1
        return aLabel.localeCompare(bLabel)
      })
      .slice(0, 8)
      .map((trigger) => ({
        id: `trigger-match-${trigger.value}`,
        value: `trigger:${trigger.value}`,
        label: trigger.label,
        description: `${trigger.label}-triggered runs`,
        category: 'trigger' as const,
        color: trigger.color,
      }))

    return matches
  }

  /**
   * Match workflows by name/description
   */
  private getMatchingWorkflows(query: string): Suggestion[] {
    if (!query.trim() || this.workflowsData.length === 0) return []

    const lowerQuery = query.toLowerCase()

    const matches = this.workflowsData
      .filter(
        (workflow) =>
          workflow.name.toLowerCase().includes(lowerQuery) ||
          workflow.description?.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()

        if (aName === lowerQuery) return -1
        if (bName === lowerQuery) return 1
        if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1
        if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1
        return aName.localeCompare(bName)
      })
      .slice(0, 8)
      .map((workflow) => ({
        id: `workflow-match-${workflow.id}`,
        value: `workflow:"${workflow.name}"`,
        label: workflow.name,
        description: workflow.description,
        category: 'workflow' as const,
      }))

    return matches
  }

  /**
   * Match folders by name
   */
  private getMatchingFolders(query: string): Suggestion[] {
    if (!query.trim() || this.foldersData.length === 0) return []

    const lowerQuery = query.toLowerCase()

    const matches = this.foldersData
      .filter((folder) => folder.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()

        if (aName === lowerQuery) return -1
        if (bName === lowerQuery) return 1
        if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1
        if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1
        return aName.localeCompare(bName)
      })
      .slice(0, 8)
      .map((folder) => ({
        id: `folder-match-${folder.id}`,
        value: `folder:"${folder.name}"`,
        label: folder.name,
        category: 'folder' as const,
      }))

    return matches
  }
}
