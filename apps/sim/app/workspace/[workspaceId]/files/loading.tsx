'use client'

import { File as FilesIcon, FolderPlus, Plus, Upload } from '@sim/emcn'
import {
  type ChromeActionSpec,
  ResourceChromeFallback,
} from '@/app/workspace/[workspaceId]/components'

const COLUMNS = [
  { id: 'name', header: '名称', widthMultiplier: 1.15 },
  { id: 'size', header: '大小', widthMultiplier: 0.85 },
  { id: 'type', header: '类型', widthMultiplier: 1.0 },
  { id: 'created', header: '创建时间' },
  { id: 'owner', header: '所有者' },
  { id: 'updated', header: '最近更新' },
]

const ACTIONS: ChromeActionSpec[] = [
  { text: '上传', icon: Upload },
  { text: '新建文件夹', icon: FolderPlus },
  { text: '新建文件', icon: Plus, variant: 'primary' },
]

export default function FilesLoading() {
  return (
    <ResourceChromeFallback
      icon={FilesIcon}
      title='文件'
      columns={COLUMNS}
      actions={ACTIONS}
      searchPlaceholder='搜索文件…'
      hasSort
      hasFilter
    />
  )
}
