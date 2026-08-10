'use client'

import { useCallback, useMemo, useState } from 'react'
import { Badge, Button, ChipInput, ChipSelect, cn, Label, Skeleton } from '@sim/emcn'
import { useParams } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import { AnthropicIcon, OpenAIIcon } from '@/components/icons'
import {
  BYOKKeyManager,
  type BYOKManagerProvider,
} from '@/app/workspace/[workspaceId]/settings/components/byok/byok-key-manager'
import {
  type MothershipTab,
  mothershipParsers,
  mothershipUrlKeys,
} from '@/app/workspace/[workspaceId]/settings/components/mothership/search-params'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  type MothershipByokKey,
  type MothershipEnv,
  useDeleteMothershipByok,
  useGenerateLicense,
  useMothershipByokKeys,
  useMothershipLicenses,
  useMothershipRequests,
  useMothershipUserBreakdown,
  useUpsertMothershipByok,
} from '@/hooks/queries/mothership-admin'

const ENTERPRISE_BYOK_PROVIDERS: BYOKManagerProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: OpenAIIcon,
    description: '企业级 Mothership LLM 调用',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: AnthropicIcon,
    description: '企业级 Mothership LLM 调用',
    placeholder: 'sk-ant-...',
  },
]

const TABS: { id: MothershipTab; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'licenses', label: '许可证' },
  { id: 'byok', label: 'BYOK' },
]

const ENV_OPTIONS: { value: MothershipEnv; label: string }[] = [
  { value: 'dev', label: '开发' },
  { value: 'staging', label: '预发布' },
  { value: 'prod', label: '生产' },
]

function defaultTimeRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return {
    start: start.toISOString().slice(0, 16),
    end: end.toISOString().slice(0, 16),
  }
}

function toRFC3339(local: string) {
  if (!local) return ''
  return new Date(local).toISOString()
}

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function Divider() {
  return <div className='h-px bg-[var(--border)]' />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className='font-medium text-[var(--text-muted)] text-small'>{children}</p>
}

export function Mothership() {
  const [{ tab: activeTab, env: environment }, setMothershipParams] = useQueryStates(
    mothershipParsers,
    mothershipUrlKeys
  )
  const defaults = useMemo(() => defaultTimeRange(), [])
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)

  return (
    <SettingsPanel>
      <div className='flex flex-col gap-6'>
        <div className='flex items-center gap-2'>
          <Label className='text-[var(--text-secondary)] text-sm'>环境</Label>
          <ChipSelect
            align='start'
            dropdownWidth={160}
            value={environment}
            onChange={(value) => setMothershipParams({ env: value as MothershipEnv })}
            placeholder='选择环境'
            options={ENV_OPTIONS}
          />
        </div>

        <div className='flex gap-1 border-[var(--border-secondary)] border-b pb-px'>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type='button'
              onClick={() => setMothershipParams({ tab: tab.id })}
              className={cn(
                'relative px-3 py-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover-hover:hover:text-[var(--text-secondary)]'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className='absolute right-0 bottom-0 left-0 h-[2px] bg-[var(--text-primary)]' />
              )}
            </button>
          ))}
        </div>

        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-2'>
            <Label className='text-[var(--text-secondary)] text-caption'>从</Label>
            <ChipInput
              type='datetime-local'
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className='flex items-center gap-2'>
            <Label className='text-[var(--text-secondary)] text-caption'>至</Label>
            <ChipInput type='datetime-local' value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <Divider />

        {activeTab === 'overview' && (
          <OverviewTab environment={environment} start={toRFC3339(start)} end={toRFC3339(end)} />
        )}
        {activeTab === 'licenses' && <LicensesTab environment={environment} />}
        {activeTab === 'byok' && <ByokTab />}
      </div>
    </SettingsPanel>
  )
}

function ByokTab() {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''

  const { data, isLoading } = useMothershipByokKeys(workspaceId)
  const upsert = useUpsertMothershipByok()
  const del = useDeleteMothershipByok()

  const configuredProviderIds = useMemo(
    () => new Set(((data?.keys as MothershipByokKey[]) ?? []).map((k) => k.provider)),
    [data]
  )

  return (
    <BYOKKeyManager
      providers={ENTERPRISE_BYOK_PROVIDERS}
      configuredProviderIds={configuredProviderIds}
      isLoading={isLoading}
      isSaving={upsert.isPending}
      isDeleting={del.isPending}
      showSearch={false}
      description='为此工作区存储客户提供的 Anthropic 或 OpenAI 密钥。该密钥在 Mothership 中静态加密,且仅用于此工作区的企业级请求。'
      onSave={async (provider, apiKey) => {
        await upsert.mutateAsync({ workspaceId, provider, apiKey })
      }}
      onDelete={async (provider) => {
        await del.mutateAsync({ workspaceId, provider })
      }}
    />
  )
}

function OverviewTab({
  environment,
  start,
  end,
}: {
  environment: MothershipEnv
  start: string
  end: string
}) {
  const { data: breakdown, isLoading: breakdownLoading } = useMothershipUserBreakdown(
    environment,
    start,
    end
  )
  const { data: requests, isLoading: requestsLoading } = useMothershipRequests(
    environment,
    start,
    end
  )

  return (
    <div className='flex flex-col gap-5'>
      <div className='grid grid-cols-4 gap-3'>
        <StatCard label='请求总数' value={breakdown?.total_requests} loading={breakdownLoading} />
        <StatCard label='独立用户' value={breakdown?.total_users} loading={breakdownLoading} />
        <StatCard
          label='总成本'
          value={
            breakdown?.users
              ? formatCost(
                  breakdown.users.reduce(
                    (s: number, u: { total_cost: number }) => s + u.total_cost,
                    0
                  )
                )
              : undefined
          }
          loading={breakdownLoading}
        />
        <StatCard
          label='平均请求成本'
          value={
            breakdown?.total_requests && breakdown.users
              ? formatCost(
                  breakdown.users.reduce(
                    (s: number, u: { total_cost: number }) => s + u.total_cost,
                    0
                  ) / breakdown.total_requests
                )
              : undefined
          }
          loading={breakdownLoading}
        />
      </div>

      <SectionLabel>用户明细</SectionLabel>
      {breakdownLoading && (
        <div className='flex flex-col gap-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-[36px] w-full rounded-md' />
          ))}
        </div>
      )}
      {breakdown?.users && (
        <div className='flex flex-col gap-0.5'>
          <div className='flex items-center gap-3 border-[var(--border-secondary)] border-b px-3 py-2 text-[var(--text-tertiary)] text-caption'>
            <span className='flex-1'>用户 ID</span>
            <span className='w-[100px] text-right'>请求数</span>
            <span className='w-[100px] text-right'>成本</span>
            <span className='w-[160px] text-right'>最近请求</span>
          </div>
          {breakdown.users.map(
            (u: {
              user_id: string
              request_count: number
              total_cost: number
              last_request: string
            }) => (
              <div
                key={u.user_id}
                className='flex items-center gap-3 border-[var(--border-secondary)] border-b px-3 py-2 text-small last:border-b-0'
              >
                <span className='flex-1 truncate font-mono text-[12px] text-[var(--text-primary)]'>
                  {u.user_id}
                </span>
                <span className='w-[100px] text-right text-[var(--text-secondary)]'>
                  {u.request_count}
                </span>
                <span className='w-[100px] text-right text-[var(--text-secondary)]'>
                  {formatCost(u.total_cost)}
                </span>
                <span className='w-[160px] text-right text-[var(--text-tertiary)] text-caption'>
                  {formatDate(u.last_request)}
                </span>
              </div>
            )
          )}
        </div>
      )}

      <Divider />
      <SectionLabel>最近请求 ({requests?.count ?? '…'})</SectionLabel>
      {requestsLoading && (
        <div className='flex flex-col gap-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-[36px] w-full rounded-md' />
          ))}
        </div>
      )}
      {requests?.requests && (
        <div className='max-h-[400px] overflow-auto'>
          <div className='flex flex-col gap-0.5'>
            <div className='sticky top-0 z-10 flex items-center gap-3 border-[var(--border-secondary)] border-b bg-[var(--surface-1)] px-3 py-2 text-[var(--text-tertiary)] text-caption'>
              <span className='w-[180px]'>请求 ID</span>
              <span className='w-[80px]'>模型</span>
              <span className='w-[80px] text-right'>时长</span>
              <span className='w-[80px] text-right'>成本</span>
              <span className='w-[60px] text-right'>工具</span>
              <span className='w-[70px] text-right'>状态</span>
              <span className='flex-1 text-right'>时间</span>
            </div>
            {requests.requests
              .slice(0, 100)
              .map(
                (r: {
                  request_id: string
                  model: string
                  duration_ms: number
                  billed_total_cost: number
                  tool_call_count: number
                  error: boolean
                  aborted: boolean
                  created_at: string
                }) => (
                  <div
                    key={r.request_id}
                    className='flex items-center gap-3 border-[var(--border-secondary)] border-b px-3 py-1.5 text-small last:border-b-0'
                  >
                    <span className='w-[180px] truncate font-mono text-[11px] text-[var(--text-primary)]'>
                      {r.request_id ?? '—'}
                    </span>
                    <span className='w-[80px] truncate text-[var(--text-secondary)] text-caption'>
                      {(r.model ?? '').replace('claude-', '')}
                    </span>
                    <span className='w-[80px] text-right text-[var(--text-secondary)] text-caption'>
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </span>
                    <span className='w-[80px] text-right text-[var(--text-secondary)] text-caption'>
                      {formatCost(r.billed_total_cost ?? 0)}
                    </span>
                    <span className='w-[60px] text-right text-[var(--text-secondary)] text-caption'>
                      {r.tool_call_count ?? 0}
                    </span>
                    <span className='w-[70px] text-right'>
                      {r.error ? (
                        <Badge variant='red'>错误</Badge>
                      ) : r.aborted ? (
                        <Badge variant='amber'>已中止</Badge>
                      ) : (
                        <Badge variant='green'>正常</Badge>
                      )}
                    </span>
                    <span className='flex-1 text-right text-[var(--text-tertiary)] text-caption'>
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                )
              )}
          </div>
        </div>
      )}
    </div>
  )
}

function LicensesTab({ environment }: { environment: MothershipEnv }) {
  const { data, isLoading, refetch } = useMothershipLicenses(environment)
  const generateLicense = useGenerateLicense(environment)
  const [newName, setNewName] = useState('')
  const [newExpiry, setNewExpiry] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const handleGenerate = useCallback(() => {
    if (!newName.trim()) return
    generateLicense.mutate(
      {
        name: newName.trim(),
        ...(newExpiry ? { expirationDate: newExpiry } : {}),
      },
      {
        onSuccess: (result) => {
          setGeneratedKey(result.license_key)
          setNewName('')
          setNewExpiry('')
          refetch()
        },
      }
    )
  }, [newName, newExpiry, generateLicense, refetch])

  return (
    <div className='flex flex-col gap-5'>
      <SectionLabel>生成许可证</SectionLabel>
      <div className='flex items-end gap-2'>
        <div className='flex flex-col gap-1'>
          <Label className='text-[var(--text-secondary)] text-caption'>企业名称</Label>
          <ChipInput
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setGeneratedKey(null)
            }}
            placeholder='例如:Acme Corp'
            className='w-[200px]'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Label className='text-[var(--text-secondary)] text-caption'>过期时间(可选)</Label>
          <ChipInput
            type='date'
            value={newExpiry}
            onChange={(e) => setNewExpiry(e.target.value)}
            className='w-[160px]'
          />
        </div>
        <Button
          variant='primary'
          className='h-[32px]'
          onClick={handleGenerate}
          disabled={generateLicense.isPending || !newName.trim()}
        >
          {generateLicense.isPending ? '生成中...' : '生成'}
        </Button>
      </div>

      {generatedKey && (
        <div className='rounded-md border border-[var(--border-secondary)] bg-[var(--surface-hover)] p-3'>
          <p className='mb-1 text-[var(--text-secondary)] text-caption'>许可证密钥(仅显示一次):</p>
          <code className='block break-all font-mono text-[12px] text-[var(--text-primary)]'>
            {generatedKey}
          </code>
        </div>
      )}

      {generateLicense.error && (
        <p className='text-[var(--text-error)] text-small'>{generateLicense.error.message}</p>
      )}

      <Divider />
      <SectionLabel>所有许可证</SectionLabel>

      {isLoading && (
        <div className='flex flex-col gap-2'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-[40px] w-full rounded-md' />
          ))}
        </div>
      )}

      {data?.licenses && (
        <div className='flex flex-col gap-0.5'>
          <div className='flex items-center gap-3 border-[var(--border-secondary)] border-b px-3 py-2 text-[var(--text-tertiary)] text-caption'>
            <span className='flex-1'>名称</span>
            <span className='w-[100px] text-right'>验证次数</span>
            <span className='w-[140px] text-right'>过期时间</span>
            <span className='w-[140px] text-right'>创建时间</span>
          </div>
          {data.licenses.length === 0 && (
            <SettingsEmptyState variant='inline'>未找到许可证。</SettingsEmptyState>
          )}
          {data.licenses.map(
            (lic: {
              id: string
              name: string
              count: number
              expiration_date?: string
              created_at: string
            }) => (
              <div
                key={lic.id}
                className='flex items-center gap-3 border-[var(--border-secondary)] border-b px-3 py-2 text-small last:border-b-0'
              >
                <span className='flex-1 text-[var(--text-primary)]'>{lic.name}</span>
                <span className='w-[100px] text-right text-[var(--text-secondary)]'>
                  {lic.count}
                </span>
                <span className='w-[140px] text-right text-[var(--text-tertiary)] text-caption'>
                  {lic.expiration_date ? formatDate(lic.expiration_date) : '永久'}
                </span>
                <span className='w-[140px] text-right text-[var(--text-tertiary)] text-caption'>
                  {formatDate(lic.created_at)}
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string
  value?: string | number
  loading?: boolean
}) {
  return (
    <div className='rounded-md border border-[var(--border-secondary)] p-3'>
      <p className='text-[var(--text-tertiary)] text-caption'>{label}</p>
      {loading ? (
        <Skeleton className='mt-1 h-[24px] w-[80px] rounded-sm' />
      ) : (
        <p className='mt-1 font-medium text-[18px] text-[var(--text-primary)]'>{value ?? '—'}</p>
      )}
    </div>
  )
}
