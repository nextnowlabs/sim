'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sim/emcn'
import {
  Download,
  Duplicate,
  Eye,
  FolderPlus,
  ImageUp,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Rocket,
  Shuffle,
  SquareArrowUpRight,
  Trash,
  Unlock,
} from '@sim/emcn/icons'
import { Pin, PinOff } from 'lucide-react'

interface ContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  menuRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onOpenInNewTab?: () => void
  onMarkAsRead?: () => void
  onMarkAsUnread?: () => void
  onTogglePin?: () => void
  onRename?: () => void
  onCreate?: () => void
  onCreateFolder?: () => void
  onDuplicate?: () => void
  onExport?: () => void
  onDelete: () => void
  showOpenInNewTab?: boolean
  showMarkAsRead?: boolean
  showMarkAsUnread?: boolean
  showPin?: boolean
  isPinned?: boolean
  showRename?: boolean
  showCreate?: boolean
  showCreateFolder?: boolean
  showDuplicate?: boolean
  showExport?: boolean
  disableExport?: boolean
  disableMarkAsRead?: boolean
  disableMarkAsUnread?: boolean
  disableRename?: boolean
  disableDuplicate?: boolean
  disableDelete?: boolean
  disableCreate?: boolean
  disableCreateFolder?: boolean
  onLeave?: () => void
  showLeave?: boolean
  disableLeave?: boolean
  onToggleLock?: () => void
  showLock?: boolean
  disableLock?: boolean
  isLocked?: boolean
  showDelete?: boolean
  onUploadLogo?: () => void
  showUploadLogo?: boolean
  disableUploadLogo?: boolean
  onFork?: () => void
  onSync?: () => void
  showFork?: boolean
  showSync?: boolean
}

/**
 * Context menu component for workflow, folder, and workspace items.
 * Uses DropdownMenu for accessible, hover-expandable submenus.
 */
export function ContextMenu({
  isOpen,
  position,
  menuRef,
  onClose,
  onOpenInNewTab,
  onMarkAsRead,
  onMarkAsUnread,
  onTogglePin,
  onRename,
  onCreate,
  onCreateFolder,
  onDuplicate,
  onExport,
  onDelete,
  showOpenInNewTab = false,
  showMarkAsRead = false,
  showMarkAsUnread = false,
  showPin = false,
  isPinned = false,
  showRename = true,
  showCreate = false,
  showCreateFolder = false,
  showDuplicate = true,
  showExport = false,
  disableExport = false,
  disableMarkAsRead = false,
  disableMarkAsUnread = false,
  disableRename = false,
  disableDuplicate = false,
  disableDelete = false,
  disableCreate = false,
  disableCreateFolder = false,
  onLeave,
  showLeave = false,
  disableLeave = false,
  onToggleLock,
  showLock = false,
  disableLock = false,
  isLocked = false,
  showDelete = true,
  onUploadLogo,
  showUploadLogo = false,
  disableUploadLogo = false,
  onFork,
  onSync,
  showFork = false,
  showSync = false,
}: ContextMenuProps) {
  const hasNavigationSection = showOpenInNewTab && onOpenInNewTab
  const hasStatusSection =
    (showMarkAsRead && onMarkAsRead) ||
    (showMarkAsUnread && onMarkAsUnread) ||
    (showPin && onTogglePin)
  const hasEditSection =
    (showRename && onRename) ||
    (showCreate && onCreate) ||
    (showCreateFolder && onCreateFolder) ||
    (showLock && onToggleLock) ||
    (showUploadLogo && onUploadLogo)
  const hasCopySection = (showDuplicate && onDuplicate) || (showExport && onExport)
  const hasForkSection = (showFork && onFork) || (showSync && onSync)

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '1px',
            height: '1px',
            pointerEvents: 'none',
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={menuRef}
        align='start'
        side='bottom'
        sideOffset={4}
        className='max-h-[var(--radix-dropdown-menu-content-available-height,400px)]'
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {showOpenInNewTab && onOpenInNewTab && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenInNewTab()
              onClose()
            }}
          >
            <SquareArrowUpRight />
            在新标签页中打开
          </DropdownMenuItem>
        )}
        {hasNavigationSection && (hasStatusSection || hasEditSection || hasCopySection) && (
          <DropdownMenuSeparator />
        )}

        {showMarkAsRead && onMarkAsRead && (
          <DropdownMenuItem
            disabled={disableMarkAsRead}
            onSelect={() => {
              onMarkAsRead()
              onClose()
            }}
          >
            <Eye />
            标记为已读
          </DropdownMenuItem>
        )}
        {showMarkAsUnread && onMarkAsUnread && (
          <DropdownMenuItem
            disabled={disableMarkAsUnread}
            onSelect={() => {
              onMarkAsUnread()
              onClose()
            }}
          >
            <Mail />
            标记为未读
          </DropdownMenuItem>
        )}
        {showPin && onTogglePin && (
          <DropdownMenuItem
            onSelect={() => {
              onTogglePin()
              onClose()
            }}
          >
            {isPinned ? <PinOff className='size-[14px]' /> : <Pin className='size-[14px]' />}
            {isPinned ? '取消置顶' : '置顶'}
          </DropdownMenuItem>
        )}
        {hasStatusSection && (hasEditSection || hasCopySection) && <DropdownMenuSeparator />}

        {showRename && onRename && (
          <DropdownMenuItem
            disabled={disableRename}
            onSelect={() => {
              onRename()
              onClose()
            }}
          >
            <Pencil />
            重命名
          </DropdownMenuItem>
        )}
        {showCreate && onCreate && (
          <DropdownMenuItem
            disabled={disableCreate}
            onSelect={() => {
              onCreate()
              onClose()
            }}
          >
            <Plus />
            新建工作流
          </DropdownMenuItem>
        )}
        {showCreateFolder && onCreateFolder && (
          <DropdownMenuItem
            disabled={disableCreateFolder}
            onSelect={() => {
              onCreateFolder()
              onClose()
            }}
          >
            <FolderPlus />
            新建文件夹
          </DropdownMenuItem>
        )}
        {showUploadLogo && onUploadLogo && (
          <DropdownMenuItem
            disabled={disableUploadLogo}
            onSelect={() => {
              onUploadLogo()
              onClose()
            }}
          >
            <ImageUp />
            上传徽标
          </DropdownMenuItem>
        )}
        {showLock && onToggleLock && (
          <DropdownMenuItem
            disabled={disableLock}
            onSelect={() => {
              onToggleLock()
              onClose()
            }}
          >
            {isLocked ? <Unlock /> : <Lock />}
            {isLocked ? '解锁' : '锁定'}
          </DropdownMenuItem>
        )}

        {hasEditSection && hasCopySection && <DropdownMenuSeparator />}
        {showDuplicate && onDuplicate && (
          <DropdownMenuItem
            disabled={disableDuplicate}
            onSelect={() => {
              onDuplicate()
              onClose()
            }}
          >
            <Duplicate />
            复制
          </DropdownMenuItem>
        )}
        {showExport && onExport && (
          <DropdownMenuItem
            disabled={disableExport}
            onSelect={() => {
              onExport()
              onClose()
            }}
          >
            <Download />
            导出
          </DropdownMenuItem>
        )}

        {(hasNavigationSection || hasStatusSection || hasEditSection || hasCopySection) &&
          hasForkSection && <DropdownMenuSeparator />}
        {showFork && onFork && (
          <DropdownMenuItem
            onSelect={() => {
              onFork()
              onClose()
            }}
          >
            <Shuffle />
            管理副本
          </DropdownMenuItem>
        )}
        {showSync && onSync && (
          <DropdownMenuItem
            onSelect={() => {
              onSync()
              onClose()
            }}
          >
            <Rocket />
            同步工作区
          </DropdownMenuItem>
        )}

        {(hasNavigationSection ||
          hasStatusSection ||
          hasEditSection ||
          hasCopySection ||
          hasForkSection) &&
          (showLeave || showDelete) && <DropdownMenuSeparator />}
        {showLeave && onLeave && (
          <DropdownMenuItem
            disabled={disableLeave}
            onSelect={() => {
              onLeave()
              onClose()
            }}
          >
            <LogOut />
            退出
          </DropdownMenuItem>
        )}
        {showDelete && (
          <DropdownMenuItem
            disabled={disableDelete}
            onSelect={() => {
              onDelete()
              onClose()
            }}
          >
            <Trash />
            删除
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
