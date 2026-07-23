'use client'

import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { useProviderModels } from '@/hooks/queries/providers'
import {
  updateLiteLLMProviderModels,
  updateVLLMProviderModels,
} from '@/providers/utils'
import { type ProviderName, useProvidersStore } from '@/stores/providers'

const logger = createLogger('ProviderModelsLoader')

function useSyncProvider(provider: ProviderName, workspaceId?: string) {
  const setProviderModels = useProvidersStore((state) => state.setProviderModels)
  const setProviderLoading = useProvidersStore((state) => state.setProviderLoading)
  const { data, isLoading, isFetching, error } = useProviderModels(provider, workspaceId)

  useEffect(() => {
    setProviderLoading(provider, isLoading || isFetching)
  }, [provider, isLoading, isFetching, setProviderLoading])

  useEffect(() => {
    if (!data) return

    try {
      if (provider === 'vllm') {
        updateVLLMProviderModels(data.models)
      } else if (provider === 'litellm') {
        updateLiteLLMProviderModels(data.models)
      }
    } catch (syncError) {
      logger.warn(`Failed to sync provider definitions for ${provider}`, syncError as Error)
    }

    setProviderModels(provider, data.models)
  }, [provider, data, setProviderModels])

  useEffect(() => {
    if (error) {
      logger.error(`Failed to load ${provider} models`, error)
    }
  }, [provider, error])
}

export function ProviderModelsLoader() {
  useSyncProvider('base')
  useSyncProvider('vllm')
  useSyncProvider('litellm')
  return null
}
