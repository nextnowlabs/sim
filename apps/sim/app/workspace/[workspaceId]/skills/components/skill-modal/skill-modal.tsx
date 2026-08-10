'use client'

import { useState } from 'react'
import {
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  ChipModalTabs,
  chipFieldSurfaceClass,
  cn,
} from '@sim/emcn'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { SkillImport } from '@/app/workspace/[workspaceId]/skills/components/skill-import'
import { parseSkillMarkdown } from '@/app/workspace/[workspaceId]/skills/components/utils'
import type { SkillDefinition } from '@/hooks/queries/skills'
import { useCreateSkill, useUpdateSkill } from '@/hooks/queries/skills'

const RichMarkdownField = dynamic(
  () =>
    import(
      '@/app/workspace/[workspaceId]/files/components/file-viewer/rich-markdown-editor/rich-markdown-field'
    ).then((m) => m.RichMarkdownField),
  {
    ssr: false,
    loading: () => <div className={cn('min-h-[200px]', chipFieldSurfaceClass)} />,
  }
)

interface SkillModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onDelete?: (skillId: string) => void
  initialValues?: SkillDefinition
}

const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

interface FieldErrors {
  name?: string
  description?: string
  content?: string
  general?: string
}

type TabValue = 'create' | 'import'

export function SkillModal({
  open,
  onOpenChange,
  onSave,
  onDelete,
  initialValues,
}: SkillModalProps) {
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const createSkill = useCreateSkill()
  const updateSkill = useUpdateSkill()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  /**
   * Bumped to remount the seed-once rich Content editor whenever `content` is set programmatically — a
   * reset from a changed `initialValues` or a destructured SKILL.md paste — so the editor re-seeds (an
   * `initialValues` change for the same skill keeps the React key otherwise stable).
   */
  const [contentSeed, setContentSeed] = useState(0)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabValue>('create')
  const [prevOpen, setPrevOpen] = useState(false)
  const [prevInitialValues, setPrevInitialValues] = useState(initialValues)

  // Reset by skill id, not object identity — a background refetch for the same open skill must not clobber an in-progress edit.
  if ((open && !prevOpen) || (open && initialValues?.id !== prevInitialValues?.id)) {
    setName(initialValues?.name ?? '')
    setDescription(initialValues?.description ?? '')
    setContent(initialValues?.content ?? '')
    setErrors({})
    setActiveTab('create')
    setContentSeed((seed) => seed + 1)
  }
  if (open !== prevOpen) setPrevOpen(open)
  if (initialValues !== prevInitialValues) setPrevInitialValues(initialValues)

  const hasChanges =
    !initialValues ||
    name !== initialValues.name ||
    description !== initialValues.description ||
    content !== initialValues.content

  const handleSave = async () => {
    const newErrors: FieldErrors = {}

    if (!name.trim()) {
      newErrors.name = '名称为必填项'
    } else if (name.length > 64) {
      newErrors.name = '名称不能超过 64 个字符'
    } else if (!KEBAB_CASE_REGEX.test(name)) {
      newErrors.name = '名称必须为 kebab-case(例如 my-skill)'
    }

    if (!description.trim()) {
      newErrors.description = '描述为必填项'
    }

    if (!content.trim()) {
      newErrors.content = '内容为必填项'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)

    try {
      if (initialValues) {
        await updateSkill.mutateAsync({
          workspaceId,
          skillId: initialValues.id,
          updates: { name, description, content },
        })
      } else {
        await createSkill.mutateAsync({
          workspaceId,
          skill: { name, description, content },
        })
      }
      onSave()
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('already exists')
          ? error.message
          : '保存技能失败,请重试。'
      setErrors({ general: message })
    } finally {
      setSaving(false)
    }
  }

  const applyImportedSkill = (data: { name: string; description: string; content: string }) => {
    setName(data.name)
    setDescription(data.description)
    setContent(data.content)
    setErrors({})
    setContentSeed((seed) => seed + 1)
  }

  const handleImport = (data: { name: string; description: string; content: string }) => {
    applyImportedSkill(data)
    setActiveTab('create')
  }

  /**
   * Pasting a full SKILL.md destructures it into the fields. Gated on a real YAML `name:` key — a
   * stray `---` thematic break or a heading-only snippet pastes as ordinary content instead of
   * silently overwriting all three fields.
   */
  const handleContentPaste = (text: string): boolean => {
    const parsed = parseSkillMarkdown(text)
    if (!parsed.nameFromFrontmatter) return false
    applyImportedSkill(parsed)
    return true
  }

  const isEditing = !!initialValues
  const readOnly = !!initialValues?.readOnly
  const showFooter = activeTab === 'create' || isEditing

  return (
    <ChipModal
      open={open}
      onOpenChange={onOpenChange}
      srTitle={isEditing ? '编辑技能' : '添加技能'}
      size='lg'
    >
      <ChipModalHeader onClose={() => onOpenChange(false)}>
        {isEditing ? '编辑技能' : '添加技能'}
      </ChipModalHeader>

      <ChipModalBody>
        {!isEditing && (
          <ChipModalTabs
            tabs={[
              { value: 'create', label: '创建' },
              { value: 'import', label: '导入' },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as TabValue)}
          />
        )}

        {activeTab === 'create' || isEditing ? (
          <>
            <ChipModalField
              type='input'
              title='名称'
              value={name}
              onChange={(value) => {
                setName(value)
                if (errors.name || errors.general)
                  setErrors((prev) => ({ ...prev, name: undefined, general: undefined }))
              }}
              placeholder='my-skill-name'
              required
              error={errors.name}
              hint='小写字母、数字和连字符(例如 my-skill)'
            />

            <ChipModalField
              type='input'
              title='描述'
              value={description}
              onChange={(value) => {
                setDescription(value)
                if (errors.description || errors.general)
                  setErrors((prev) => ({ ...prev, description: undefined, general: undefined }))
              }}
              placeholder='这个技能的用途及适用场景…'
              maxLength={1024}
              required
              error={errors.description}
            />

            <ChipModalField type='custom' title='内容' required error={errors.content}>
              <RichMarkdownField
                key={`${initialValues?.id ?? 'new'}:${contentSeed}`}
                value={content}
                onChange={(value) => {
                  setContent(value)
                  if (errors.content || errors.general)
                    setErrors((prev) => ({ ...prev, content: undefined, general: undefined }))
                }}
                placeholder='用 Markdown 编写的技能指令…'
                minHeight={200}
                disabled={readOnly || saving}
                error={!!errors.content}
                workspaceId={workspaceId}
                onPasteText={handleContentPaste}
              />
            </ChipModalField>

            <ChipModalError>{errors.general}</ChipModalError>
          </>
        ) : (
          <SkillImport onImport={handleImport} />
        )}
      </ChipModalBody>

      {showFooter && (
        <ChipModalFooter
          onCancel={() => onOpenChange(false)}
          cancelDisabled={readOnly}
          secondaryActions={
            isEditing && onDelete
              ? [
                  {
                    label: '删除',
                    onClick: () => onDelete(initialValues.id),
                    variant: 'destructive',
                    disabled: readOnly,
                  },
                ]
              : undefined
          }
          primaryAction={{
            label: saving ? '保存中…' : isEditing ? '更新' : '创建',
            onClick: handleSave,
            disabled: readOnly || saving || !hasChanges,
          }}
        />
      )}
    </ChipModal>
  )
}
