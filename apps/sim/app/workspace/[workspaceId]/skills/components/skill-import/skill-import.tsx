'use client'

import { useCallback, useState } from 'react'
import { Chip, ChipInput, ChipModalField, Loader } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { requestJson } from '@/lib/api/client/request'
import { importSkillContract } from '@/lib/api/contracts'
import {
  extractSkillFromZip,
  parseSkillMarkdown,
} from '@/app/workspace/[workspaceId]/skills/components/utils'

interface ImportedSkill {
  name: string
  description: string
  content: string
}

interface SkillImportProps {
  onImport: (data: ImportedSkill) => void
}

type ImportState = 'idle' | 'loading' | 'error'

const ACCEPTED_EXTENSIONS = ['.md', '.zip']

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function SkillImport({ onImport }: SkillImportProps) {
  const [githubUrl, setGithubUrl] = useState('')
  const [githubState, setGithubState] = useState<ImportState>('idle')
  const [githubError, setGithubError] = useState('')

  const [fileState, setFileState] = useState<ImportState>('idle')
  const [fileError, setFileError] = useState('')

  const handleGithubImport = useCallback(async () => {
    const trimmed = githubUrl.trim()
    if (!trimmed) {
      setGithubError('请输入 GitHub URL')
      setGithubState('error')
      return
    }

    setGithubState('loading')
    setGithubError('')

    try {
      const data = await requestJson(importSkillContract, { body: { url: trimmed } })
      const parsed = parseSkillMarkdown(data.content)
      setGithubState('idle')
      onImport(parsed)
    } catch (err) {
      const message = getErrorMessage(err, '从 GitHub 导入失败')
      setGithubError(message)
      setGithubState('error')
    }
  }, [githubUrl, onImport])

  const processFile = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        setFileError('不支持的文件类型。请使用 .md 或 .zip 文件。')
        setFileState('error')
        return
      }

      setFileState('loading')
      setFileError('')

      try {
        let rawContent: string

        if (file.name.toLowerCase().endsWith('.zip')) {
          if (file.size > 5 * 1024 * 1024) {
            setFileError('ZIP 文件过大(最大 5 MB)')
            setFileState('error')
            return
          }
          rawContent = await extractSkillFromZip(file)
        } else {
          rawContent = await file.text()
        }

        const parsed = parseSkillMarkdown(rawContent)
        setFileState('idle')
        onImport(parsed)
      } catch (err) {
        const message = getErrorMessage(err, '处理文件失败')
        setFileError(message)
        setFileState('error')
      }
    },
    [onImport]
  )

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  return (
    <div className='flex flex-col gap-4'>
      <ChipModalField type='custom' title='从 GitHub 导入' error={githubError || undefined}>
        <div className='flex gap-2'>
          <ChipInput
            placeholder='https://github.com/owner/repo/blob/main/SKILL.md'
            value={githubUrl}
            onChange={(e) => {
              setGithubUrl(e.target.value)
              if (githubError) setGithubError('')
            }}
            disabled={githubState === 'loading'}
            className='min-w-0 flex-1'
          />
          <Chip
            flush
            onClick={handleGithubImport}
            disabled={githubState === 'loading' || !githubUrl.trim()}
          >
            {githubState === 'loading' ? <Loader className='size-[14px]' animate /> : '获取'}
          </Chip>
        </div>
      </ChipModalField>

      <ImportDivider />

      <ChipModalField
        type='file'
        title='上传文件'
        accept='.md,.zip'
        onChange={handleFiles}
        loading={fileState === 'loading'}
        label={fileState === 'loading' ? '导入中…' : undefined}
        description='带 YAML frontmatter 的 .md 文件,或包含 SKILL.md 的 .zip 文件'
        error={fileError || undefined}
      />
    </div>
  )
}

function ImportDivider() {
  return (
    <div className='flex items-center gap-3 px-2'>
      <div className='h-px flex-1 bg-[var(--border)]' />
      <span className='text-[11px] text-[var(--text-muted)]'>或</span>
      <div className='h-px flex-1 bg-[var(--border)]' />
    </div>
  )
}
