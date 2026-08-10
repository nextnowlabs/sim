'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@sim/emcn'
import { Clipboard, Duplicate, Search, SelectAll } from '@sim/emcn/icons'
import { Scissors } from 'lucide-react'

interface EditorContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  hasSelection: boolean
  canEdit: boolean
  onCut: () => void
  onCopy: () => void
  onCopyAll: () => void
  onPaste: () => void
  onSelectAll: () => void
  onFind: () => void
}

export function EditorContextMenu({
  isOpen,
  position,
  onClose,
  hasSelection,
  canEdit,
  onCut,
  onCopy,
  onCopyAll,
  onPaste,
  onSelectAll,
  onFind,
}: EditorContextMenuProps) {
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
          tabIndex={-1}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        side='bottom'
        sideOffset={2}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {canEdit && (
          <DropdownMenuItem disabled={!hasSelection} onSelect={onCut}>
            <Scissors />
            剪切
            <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!hasSelection} onSelect={onCopy}>
          <Duplicate />
          复制
          <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopyAll}>
          <Duplicate />
          复制全部
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onPaste}>
              <Clipboard />
              粘贴
              <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelectAll}>
          <SelectAll />
          全选
          <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onFind}>
          <Search />
          查找
          <DropdownMenuShortcut>⌘F</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
