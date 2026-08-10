'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import {
  AnthropicIcon,
  BasetenIcon,
  BrandfetchIcon,
  DatagmaIcon,
  DropcontactIcon,
  EnrowIcon,
  ExaAIIcon,
  FalIcon,
  FindymailIcon,
  FirecrawlIcon,
  FireworksIcon,
  GeminiIcon,
  GoogleIcon,
  HunterIOIcon,
  IcypeasIcon,
  JinaAIIcon,
  LeadMagicIcon,
  LinkupIcon,
  MillionVerifierIcon,
  MistralIcon,
  NeverBounceIcon,
  OllamaIcon,
  OpenAIIcon,
  ParallelIcon,
  PeopleDataLabsIcon,
  PerplexityIcon,
  ProspeoIcon,
  SerperIcon,
  TogetherIcon,
  WizaIcon,
  ZeroBounceIcon,
} from '@/components/icons'
import { MAX_BYOK_KEYS_PER_PROVIDER } from '@/lib/api/contracts/byok-keys'
import {
  BYOKKeyManager,
  type BYOKManagerKey,
  type BYOKManagerProvider,
  type BYOKProviderSection,
} from '@/app/workspace/[workspaceId]/settings/components/byok/byok-key-manager'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import { useBYOKKeys, useDeleteBYOKKey, useUpsertBYOKKey } from '@/hooks/queries/byok-keys'
import type { BYOKProviderId } from '@/tools/types'

const PROVIDERS: (BYOKManagerProvider & { id: BYOKProviderId })[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: OpenAIIcon,
    description: 'LLM 调用和知识库嵌入',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: AnthropicIcon,
    description: 'LLM 调用',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'google',
    name: 'Google',
    icon: GeminiIcon,
    description: 'LLM 调用',
    placeholder: '输入你的 API 密钥',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    icon: MistralIcon,
    description: 'LLM 调用和知识库 OCR',
    placeholder: '输入你的 API 密钥',
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    icon: FireworksIcon,
    description: 'LLM 调用',
    placeholder: '输入你的 Fireworks API 密钥',
  },
  {
    id: 'together',
    name: 'Together AI',
    icon: TogetherIcon,
    description: 'LLM 调用',
    placeholder: '输入你的 Together AI API 密钥',
  },
  {
    id: 'baseten',
    name: 'Baseten',
    icon: BasetenIcon,
    description: 'LLM 调用',
    placeholder: '输入你的 Baseten API 密钥',
  },
  {
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    icon: OllamaIcon,
    description: 'LLM 调用',
    placeholder: '输入你的 Ollama API 密钥',
  },
  {
    id: 'falai',
    name: 'Fal.ai',
    icon: FalIcon,
    description: '图像和视频生成',
    placeholder: '输入你的 Fal.ai API 密钥',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    icon: FirecrawlIcon,
    description: '网页抓取、爬取、搜索和提取',
    placeholder: '输入你的 Firecrawl API 密钥',
  },
  {
    id: 'exa',
    name: 'Exa',
    icon: ExaAIIcon,
    description: 'AI 驱动的搜索与研究',
    placeholder: '输入你的 Exa API 密钥',
  },
  {
    id: 'serper',
    name: 'Serper',
    icon: SerperIcon,
    description: 'Google 搜索 API',
    placeholder: '输入你的 Serper API 密钥',
  },
  {
    id: 'linkup',
    name: 'Linkup',
    icon: LinkupIcon,
    description: '网页搜索和内容检索',
    placeholder: '输入你的 Linkup API 密钥',
  },
  {
    id: 'parallel_ai',
    name: 'Parallel AI',
    icon: ParallelIcon,
    description: '网页搜索、提取和深度研究',
    placeholder: '输入你的 Parallel AI API 密钥',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: PerplexityIcon,
    description: 'AI 驱动的对话和网页搜索',
    placeholder: 'pplx-...',
  },
  {
    id: 'jina',
    name: 'Jina AI',
    icon: JinaAIIcon,
    description: '网页阅读和搜索',
    placeholder: 'jina_...',
  },
  {
    id: 'google_cloud',
    name: 'Google Cloud',
    icon: GoogleIcon,
    description: 'Translate、Maps、PageSpeed 和 Books API',
    placeholder: '输入你的 Google Cloud API 密钥',
  },
  {
    id: 'brandfetch',
    name: 'Brandfetch',
    icon: BrandfetchIcon,
    description: '品牌资产、Logo、配色和公司信息',
    placeholder: '输入你的 Brandfetch API 密钥',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    icon: HunterIOIcon,
    description: '邮箱查找、验证和域名搜索',
    placeholder: '输入你的 Hunter.io API 密钥',
  },
  {
    id: 'peopledatalabs',
    name: 'People Data Labs',
    icon: PeopleDataLabsIcon,
    description: '个人和公司数据丰富、搜索与身份识别',
    placeholder: '输入你的 People Data Labs API 密钥',
  },
  {
    id: 'findymail',
    name: 'Findymail',
    icon: FindymailIcon,
    description: '邮箱查找、验证和电话查询',
    placeholder: '输入你的 Findymail API 密钥',
  },
  {
    id: 'prospeo',
    name: 'Prospeo',
    icon: ProspeoIcon,
    description: '个人和公司数据丰富与搜索',
    placeholder: '输入你的 Prospeo API 密钥',
  },
  {
    id: 'wiza',
    name: 'Wiza',
    icon: WizaIcon,
    description: '线索搜索、个人资料揭示和公司数据丰富',
    placeholder: '输入你的 Wiza API 密钥',
  },
  {
    id: 'datagma',
    name: 'Datagma',
    icon: DatagmaIcon,
    description: '邮箱、电话、个人和公司数据丰富',
    placeholder: '输入你的 Datagma API 密钥',
  },
  {
    id: 'dropcontact',
    name: 'Dropcontact',
    icon: DropcontactIcon,
    description: '符合 GDPR 的联系人数据丰富和邮箱查找',
    placeholder: '输入你的 Dropcontact API 密钥',
  },
  {
    id: 'leadmagic',
    name: 'LeadMagic',
    icon: LeadMagicIcon,
    description: '邮箱查找、验证和 B2B 资料丰富',
    placeholder: '输入你的 LeadMagic API 密钥',
  },
  {
    id: 'icypeas',
    name: 'Icypeas',
    icon: IcypeasIcon,
    description: '邮箱查找和验证',
    placeholder: '输入你的 Icypeas API 密钥',
  },
  {
    id: 'enrow',
    name: 'Enrow',
    icon: EnrowIcon,
    description: '邮箱查找和验证',
    placeholder: '输入你的 Enrow API 密钥',
  },
  {
    id: 'zerobounce',
    name: 'ZeroBounce',
    icon: ZeroBounceIcon,
    description: '实时邮箱验证和送达率检测',
    placeholder: '输入你的 ZeroBounce API 密钥',
  },
  {
    id: 'neverbounce',
    name: 'NeverBounce',
    icon: NeverBounceIcon,
    description: '实时邮箱验证和列表清洗',
    placeholder: '输入你的 NeverBounce API 密钥',
  },
  {
    id: 'millionverifier',
    name: 'MillionVerifier',
    icon: MillionVerifierIcon,
    description: '实时邮箱验证和送达率检测',
    placeholder: '输入你的 MillionVerifier API 密钥',
  },
]

/**
 * Provider groupings rendered as labeled sections. Every provider id in
 * {@link PROVIDERS} belongs to exactly one section; rows keep their
 * {@link PROVIDERS} order within each group.
 */
const PROVIDER_SECTIONS: BYOKProviderSection[] = [
  {
    label: '模型',
    ids: [
      'openai',
      'anthropic',
      'google',
      'mistral',
      'fireworks',
      'together',
      'baseten',
      'ollama-cloud',
      'falai',
    ],
  },
  {
    label: '搜索与网页',
    ids: [
      'firecrawl',
      'exa',
      'serper',
      'linkup',
      'parallel_ai',
      'perplexity',
      'jina',
      'google_cloud',
    ],
  },
  {
    label: '数据丰富',
    ids: [
      'brandfetch',
      'hunter',
      'peopledatalabs',
      'findymail',
      'prospeo',
      'wiza',
      'datagma',
      'dropcontact',
      'leadmagic',
      'icypeas',
      'enrow',
      'zerobounce',
      'neverbounce',
      'millionverifier',
    ],
  },
]

export function BYOK() {
  const params = useParams()
  const workspaceId = (params?.workspaceId as string) || ''

  const { data, isLoading } = useBYOKKeys(workspaceId)
  const upsertKey = useUpsertBYOKKey()
  const deleteKey = useDeleteBYOKKey()

  const keysByProvider = useMemo(() => {
    const grouped = new Map<string, BYOKManagerKey[]>()
    for (const key of data?.keys ?? []) {
      const providerKeys = grouped.get(key.providerId) ?? []
      providerKeys.push({ id: key.id, name: key.name, maskedKey: key.maskedKey })
      grouped.set(key.providerId, providerKeys)
    }
    return grouped
  }, [data?.keys])

  return (
    <SettingsPanel>
      <BYOKKeyManager
        multiKey
        providers={PROVIDERS}
        sections={PROVIDER_SECTIONS}
        keysByProvider={keysByProvider}
        maxKeysPerProvider={MAX_BYOK_KEYS_PER_PROVIDER}
        isLoading={isLoading}
        isSaving={upsertKey.isPending}
        isDeleting={deleteKey.isPending}
        onSaveKey={async ({ providerId, apiKey, keyId, name }) => {
          await upsertKey.mutateAsync({
            workspaceId,
            providerId: providerId as BYOKProviderId,
            apiKey,
            keyId,
            name,
          })
        }}
        onDeleteKey={async (providerId, keyId) => {
          await deleteKey.mutateAsync({
            workspaceId,
            providerId: providerId as BYOKProviderId,
            keyId,
          })
        }}
      />
    </SettingsPanel>
  )
}
