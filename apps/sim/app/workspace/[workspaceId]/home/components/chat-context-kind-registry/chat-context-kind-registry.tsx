import type { ReactNode } from 'react'
import {
  Calendar,
  Database,
  Folder as FolderIcon,
  Library,
  Table as TableIcon,
  Task,
  Workflow,
} from '@sim/emcn/icons'
import { AgentSkillsIcon } from '@/components/icons'
import { getDocumentIcon } from '@/components/icons/document-icons'
import type { ChatContextKind, ChatMessageContext } from '@/app/workspace/[workspaceId]/home/types'
import { getBareIconStyle } from '@/blocks/icon-color'
import { registry as blockRegistry } from '@/blocks/registry'

interface RenderIconArgs {
  context: ChatMessageContext
  className: string
}

interface ChatContextKindConfig {
  /** Human label for the kind (used in tooltips / accessible names). */
  label: string
  /** Renders the chip icon. Returns null when no icon should be shown for this kind. */
  renderIcon: (args: RenderIconArgs) => ReactNode | null
}

function renderWorkflowIcon({ className }: RenderIconArgs): ReactNode | null {
  return <Workflow className={className} />
}

/**
 * Renders the integration chip glyph: just the block's brand SVG icon, no
 * background tile — sized and positioned by the caller-supplied className
 * (same slot the `@` character normally occupies). The block is resolved
 * by `context.blockType` so the chip stays in sync with the registry.
 */
function renderIntegrationTile({ context, className }: RenderIconArgs): ReactNode | null {
  if (context.kind !== 'integration') return null
  if (!context.blockType) return null
  const block = blockRegistry[context.blockType]
  if (!block) return null
  const Icon = block.icon
  return <Icon className={className} style={getBareIconStyle(Icon)} />
}

/**
 * Single source of truth for the icon and label associated with each
 * {@link ChatContextKind}. The `Record<ChatContextKind, …>` typing forces a
 * compile error whenever a new kind is added to the union without a
 * corresponding entry here, preventing the chip from silently rendering
 * without an icon.
 */
export const CHAT_CONTEXT_KIND_REGISTRY: Record<ChatContextKind, ChatContextKindConfig> = {
  workflow: { label: '工作流', renderIcon: renderWorkflowIcon },
  current_workflow: { label: '当前工作流', renderIcon: renderWorkflowIcon },
  workflow_block: { label: '节点', renderIcon: renderWorkflowIcon },
  blocks: { label: '节点', renderIcon: () => null },
  knowledge: {
    label: '知识库',
    renderIcon: ({ className }) => <Database className={className} />,
  },
  table: {
    label: '表格',
    renderIcon: ({ className }) => <TableIcon className={className} />,
  },
  file: {
    label: '文件',
    renderIcon: ({ className, context }) => {
      const FileDocIcon = getDocumentIcon('', context.label)
      return <FileDocIcon className={className} />
    },
  },
  folder: {
    label: '文件夹',
    renderIcon: ({ className }) => <FolderIcon className={className} />,
  },
  filefolder: {
    label: '文件文件夹',
    renderIcon: ({ className }) => <FolderIcon className={className} />,
  },
  scheduledtask: {
    label: '定时任务',
    renderIcon: ({ className }) => <Calendar className={className} />,
  },
  past_chat: {
    label: '历史对话',
    renderIcon: ({ className }) => <Task className={className} />,
  },
  logs: {
    label: '日志',
    renderIcon: ({ className }) => <Library className={className} />,
  },
  docs: { label: '文档', renderIcon: () => null },
  slash_command: { label: '命令', renderIcon: () => null },
  integration: { label: '集成', renderIcon: renderIntegrationTile },
  skill: {
    label: '技能',
    renderIcon: ({ className }) => <AgentSkillsIcon className={className} />,
  },
}
