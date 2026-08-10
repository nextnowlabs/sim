'use client'

import { memo, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChipModal,
  ChipModalBody,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  cn,
  Duplicate,
  ThumbsDown,
  ThumbsUp,
  Tooltip,
  toast,
} from '@sim/emcn'
import { GitBranch } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useChatSurface } from '@/app/workspace/[workspaceId]/home/components/chat-surface-context'
import { useSubmitCopilotFeedback } from '@/hooks/queries/copilot-feedback'
import { useForkMothershipChat } from '@/hooks/queries/mothership-chats'
import { useFolderStore } from '@/stores/folders/store'

const SPECIAL_TAGS = 'thinking|options|usage_upgrade|credential|mothership-error|file'

function toPlainText(raw: string): string {
  return (
    raw
      // Strip special tags and their contents
      .replace(new RegExp(`<\\/?(${SPECIAL_TAGS})(?:>[\\s\\S]*?<\\/(${SPECIAL_TAGS})>|>)`, 'g'), '')
      // Strip markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{3}[\s\S]*?`{3}/g, '')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[>\-*]\s+/gm, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

const ICON_CLASS = 'size-[14px]'
const BUTTON_CLASS =
  'flex size-[26px] items-center justify-center rounded-[6px] text-[var(--text-icon)] transition-colors hover-hover:bg-[var(--surface-hover)] focus-visible:outline-none'

interface MessageActionsProps {
  content: string
  userQuery?: string
  requestId?: string
  messageId?: string
}

export const MessageActions = memo(function MessageActions({
  content,
  userQuery,
  requestId,
  messageId,
}: MessageActionsProps) {
  const router = useRouter()
  const params = useParams<{ workspaceId: string }>()
  const { chatId } = useChatSurface()
  const [copied, setCopied] = useState(false)
  const [copiedRequestId, setCopiedRequestId] = useState(false)
  const [pendingFeedback, setPendingFeedback] = useState<'up' | 'down' | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const resetTimeoutRef = useRef<number | null>(null)
  const requestIdTimeoutRef = useRef<number | null>(null)
  const submitFeedback = useSubmitCopilotFeedback()
  const forkChat = useForkMothershipChat(params.workspaceId)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
      if (requestIdTimeoutRef.current !== null) {
        window.clearTimeout(requestIdTimeoutRef.current)
      }
    }
  }, [])

  const copyToClipboard = async () => {
    if (!content) return
    const text = toPlainText(content)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
      resetTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const copyRequestId = async () => {
    if (!requestId) return
    try {
      await navigator.clipboard.writeText(requestId)
      setCopiedRequestId(true)
      if (requestIdTimeoutRef.current !== null) {
        window.clearTimeout(requestIdTimeoutRef.current)
      }
      requestIdTimeoutRef.current = window.setTimeout(() => setCopiedRequestId(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const handleFeedbackClick = (type: 'up' | 'down') => {
    if (chatId && userQuery) {
      setPendingFeedback(type)
      setFeedbackText('')
      setCopiedRequestId(false)
    }
  }

  const handleSubmitFeedback = () => {
    if (!pendingFeedback || !chatId || !userQuery) return
    const text = feedbackText.trim()
    if (!text) {
      setPendingFeedback(null)
      setFeedbackText('')
      return
    }
    submitFeedback.mutate({
      chatId,
      userQuery,
      agentResponse: content,
      isPositiveFeedback: pendingFeedback === 'up',
      feedback: text,
    })
    setPendingFeedback(null)
    setFeedbackText('')
  }

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setPendingFeedback(null)
      setFeedbackText('')
      setCopiedRequestId(false)
    }
  }

  const handleFork = async () => {
    if (!chatId || !messageId || forkChat.isPending) return
    try {
      const result = await forkChat.mutateAsync({ chatId, upToMessageId: messageId })
      useFolderStore.getState().clearChatSelection()
      router.push(`/workspace/${params.workspaceId}/chat/${result.id}`)
    } catch {
      toast.error('Failed to fork chat')
    }
  }

  const hasContent = Boolean(content)
  const canSubmitFeedback = Boolean(chatId && userQuery)
  const canFork = false
  if (!hasContent && !canSubmitFeedback && !canFork) return null

  return (
    <>
      <div className='flex items-center gap-0.5'>
        {hasContent && (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type='button'
                aria-label='复制消息'
                onClick={copyToClipboard}
                className={BUTTON_CLASS}
              >
                {copied ? <Check className={ICON_CLASS} /> : <Duplicate className={ICON_CLASS} />}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side='top'>
              {copied ? '已复制消息' : '复制消息'}
            </Tooltip.Content>
          </Tooltip.Root>
        )}
        {canSubmitFeedback && (
          <>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type='button'
                  aria-label='点赞'
                  onClick={() => handleFeedbackClick('up')}
                  className={BUTTON_CLASS}
                >
                  <ThumbsUp className={ICON_CLASS} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side='top'>回答不错</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type='button'
                  aria-label='点踩'
                  onClick={() => handleFeedbackClick('down')}
                  className={BUTTON_CLASS}
                >
                  <ThumbsDown className={ICON_CLASS} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Content side='top'>回答不佳</Tooltip.Content>
            </Tooltip.Root>
          </>
        )}
        {canFork && (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type='button'
                aria-label='Fork from here'
                onClick={handleFork}
                disabled={forkChat.isPending}
                className={cn(BUTTON_CLASS, forkChat.isPending && 'cursor-not-allowed opacity-50')}
              >
                <GitBranch className={ICON_CLASS} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side='top'>Fork from here</Tooltip.Content>
          </Tooltip.Root>
        )}
      </div>

      <ChipModal
        open={pendingFeedback !== null}
        onOpenChange={handleModalClose}
        srTitle='提供反馈'
      >
        <ChipModalHeader onClose={() => handleModalClose(false)}>提供反馈</ChipModalHeader>
        <ChipModalBody>
          <div className='flex items-start justify-between gap-2 px-2'>
            <p className='font-medium text-[var(--text-secondary)] text-sm'>
              {pendingFeedback === 'up' ? '你喜欢什么?' : '哪些地方可以改进?'}
            </p>
            {pendingFeedback === 'down' && requestId && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type='button'
                    aria-label='复制请求 ID'
                    onClick={copyRequestId}
                    className='flex size-[22px] shrink-0 items-center justify-center rounded-full text-[var(--text-icon)] transition-colors hover-hover:bg-[var(--surface-hover)] focus-visible:outline-none'
                  >
                    {copiedRequestId ? (
                      <Check className='size-[14px]' />
                    ) : (
                      <Duplicate className='size-[14px]' />
                    )}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content side='top'>
                  {copiedRequestId ? '已复制请求 ID' : '复制请求 ID'}
                </Tooltip.Content>
              </Tooltip.Root>
            )}
          </div>
          <ChipModalField
            type='textarea'
            title='反馈'
            value={feedbackText}
            onChange={setFeedbackText}
            rows={6}
            minHeight={140}
            resizable
            placeholder={
              pendingFeedback === 'up'
                ? '告诉我们哪些地方有帮助…'
                : '告诉我们哪里出了问题…'
            }
          />
        </ChipModalBody>
        <ChipModalFooter
          onCancel={() => handleModalClose(false)}
          primaryAction={{
            label: '提交',
            onClick: handleSubmitFeedback,
          }}
        />
      </ChipModal>
    </>
  )
})
