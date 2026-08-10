'use client'

import { Plus } from '@sim/emcn'
import { Database } from '@sim/emcn/icons'
import {
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const COLUMNS = [
  { id: 'name', header: '名称' },
  { id: 'documents', header: '文档', widthMultiplier: 0.6 },
  { id: 'tokens', header: 'Tokens', widthMultiplier: 0.6 },
  { id: 'connectors', header: '连接器', widthMultiplier: 0.7 },
  { id: 'created', header: '创建时间' },
  { id: 'owner', header: '所有者' },
  { id: 'updated', header: '最后更新' },
]

const ACTIONS: ChromeActionSpec[] = [{ text: 'New base', icon: Plus, variant: 'primary' }]

export default function KnowledgeLoading() {
  return (
    <ResourceChromeFallback
      icon={Database}
      title='知识库'
      columns={COLUMNS}
      actions={ACTIONS}
      searchPlaceholder='Search knowledge bases...'
      hasSort
      hasFilter
    />
  )
}
