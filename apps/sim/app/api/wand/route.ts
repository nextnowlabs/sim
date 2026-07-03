import { db } from '@sim/db'
import { workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { wandGenerateContract } from '@/lib/api/contracts'
import { parseRequest } from '@/lib/api/server'
import { getBYOKKey } from '@/lib/api-key/byok'
import { getSession } from '@/lib/auth'
import {
  checkActorUsageLimits,
  checkBillingBlocked,
} from '@/lib/billing/calculations/usage-monitor'
import { recordUsage } from '@/lib/billing/core/usage-log'
import { checkAndBillOverageThreshold } from '@/lib/billing/threshold-billing'
import { env } from '@/lib/core/config/env'
import { getCostMultiplier, isBillingEnabled } from '@/lib/core/config/env-flags'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { enrichTableSchema } from '@/lib/table/llm/wand'
import { verifyWorkspaceMembership } from '@/app/api/workflows/utils'
import { getModelPricing } from '@/providers/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const logger = createLogger('WandGenerateAPI')

const wandApiKey = env.WAND_LLM_API_KEY || env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY
const wandBaseUrl = env.WAND_LLM_BASE_URL || (env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1')
const wandModel = env.WAND_LLM_MODEL || (env.DEEPSEEK_API_KEY ? 'deepseek-v4-pro' : 'gpt-4o')

if (!wandApiKey) {
  logger.warn('No WAND_LLM_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY found. Wand generation will not function.')
} else {
  logger.info(`Wand using model=${wandModel} baseUrl=${wandBaseUrl}`)
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

type WandEnricher = (
  workspaceId: string | null,
  context: Record<string, unknown>
) => Promise<string | null>

const wandEnrichers: Partial<Record<string, WandEnricher>> = {
  timestamp: async () => {
    const now = new Date()
    return `Current date and time context for reference:
- Current UTC timestamp: ${now.toISOString()}
- Current Unix timestamp (seconds): ${Math.floor(now.getTime() / 1000)}
- Current Unix timestamp (milliseconds): ${now.getTime()}
- Current date (UTC): ${now.toISOString().split('T')[0]}
- Current year: ${now.getUTCFullYear()}
- Current month: ${now.getUTCMonth() + 1}
- Current day of month: ${now.getUTCDate()}
- Current day of week: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()]}

Use this context to calculate relative dates like "yesterday", "last week", "beginning of this month", etc.`
  },

  'table-schema': enrichTableSchema,
}

async function updateUserStatsForWand(
  billingUserId: string,
  workspaceId: string | null,
  usage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  },
  requestId: string,
  isBYOK = false
): Promise<void> {
  if (!isBillingEnabled) return
  if (!usage.total_tokens || usage.total_tokens <= 0) return

  try {
    const promptTokens = usage.prompt_tokens || 0
    const completionTokens = usage.completion_tokens || 0
    const modelName = wandModel

    let costToStore = 0
    if (!isBYOK) {
      const pricing = getModelPricing(modelName)
      const costMultiplier = getCostMultiplier()
      let modelCost = 0
      if (pricing) {
        modelCost = (promptTokens / 1000000) * pricing.input + (completionTokens / 1000000) * pricing.output
      } else {
        modelCost = (promptTokens / 1000000) * 0.005 + (completionTokens / 1000000) * 0.015
      }
      costToStore = modelCost * costMultiplier
    }

    await recordUsage({
      userId: billingUserId,
      workspaceId: workspaceId ?? undefined,
      entries: [{
        category: 'model',
        source: 'wand',
        description: modelName,
        cost: costToStore,
        sourceReference: `wand:${requestId}`,
        metadata: { inputTokens: promptTokens, outputTokens: completionTokens },
      }],
    })

    await checkAndBillOverageThreshold(billingUserId)
  } catch (error) {
    logger.error(`[${requestId}] Failed to update user stats for wand usage`, error)
  }
}

function extractChatCompletionsUsage(candidate: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null {
  if (!candidate) return null
  if (typeof candidate.prompt_tokens === 'number') {
    return { prompt_tokens: candidate.prompt_tokens, completion_tokens: candidate.completion_tokens ?? 0, total_tokens: candidate.total_tokens ?? 0 }
  }
  if (typeof candidate.usage === 'object' && candidate.usage) {
    const u = candidate.usage
    return { prompt_tokens: u.prompt_tokens ?? 0, completion_tokens: u.completion_tokens ?? 0, total_tokens: u.total_tokens ?? 0 }
  }
  return null
}

export const POST = withRouteHandler(async (req: NextRequest) => {
  const requestId = generateRequestId()
  logger.info(`[${requestId}] Received wand generation request`)

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`[${requestId}] Unauthorized wand generation attempt`)
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = await parseRequest(wandGenerateContract, req, {})
    if (!parsed.success) return parsed.response
    const { body } = parsed.data

    const { prompt, systemPrompt, stream = false, history = [], workflowId, workspaceId: requestedWorkspaceId, generationType, wandContext = {} } = body

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Missing required field: prompt.' }, { status: 400 })
    }

    let workspaceId: string | null = null
    if (workflowId) {
      const [workflowRecord] = await db.select({ workspaceId: workflow.workspaceId }).from(workflow).where(eq(workflow.id, workflowId)).limit(1)
      if (!workflowRecord) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 })
      workspaceId = workflowRecord.workspaceId
      if (workflowRecord.workspaceId) {
        const permission = await verifyWorkspaceMembership(session.user.id, workflowRecord.workspaceId)
        if (!permission || (permission !== 'admin' && permission !== 'write')) {
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
        }
      } else {
        return NextResponse.json({ success: false, error: 'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.' }, { status: 403 })
      }
    } else if (requestedWorkspaceId) {
      const permission = await verifyWorkspaceMembership(session.user.id, requestedWorkspaceId)
      if (permission) workspaceId = requestedWorkspaceId
    }

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'Workspace context is required.' }, { status: 400 })
    }

    const billingUserId = session.user.id
    let isBYOK = false
    let activeKey = wandApiKey

    if (workspaceId) {
      const byokResult = await getBYOKKey(workspaceId, 'openai')
      if (byokResult) {
        isBYOK = true
        activeKey = byokResult.apiKey
        logger.info(`[${requestId}] Using BYOK key for wand generation`)
      }
    }

    if (!activeKey) {
      logger.error(`[${requestId}] AI client not initialized. Missing API key.`)
      return NextResponse.json({ success: false, error: 'Wand generation service is not configured.' }, { status: 503 })
    }

    if (isBYOK) {
      const blocked = await checkBillingBlocked(billingUserId)
      if (blocked.blocked) {
        return NextResponse.json({ success: false, error: blocked.message || 'Account is not in good standing. Please contact support.' }, { status: 402 })
      }
    } else {
      const usage = await checkActorUsageLimits(billingUserId, workspaceId)
      if (usage.isExceeded) {
        return NextResponse.json({ success: false, error: usage.message || 'Usage limit exceeded. Please upgrade your plan to continue.', scope: usage.scope }, { status: 402 })
      }
    }

    let finalSystemPrompt = systemPrompt || 'You are a helpful AI assistant. Generate content exactly as requested by the user.'

    if (generationType) {
      const enricher = wandEnrichers[generationType]
      if (enricher) {
        const enrichment = await enricher(workspaceId, wandContext)
        if (enrichment) finalSystemPrompt += `\n\n${enrichment}`
      }
    }

    if (generationType === 'cron-expression') {
      finalSystemPrompt += '\n\nIMPORTANT: Return ONLY the raw cron expression (e.g., "0 9 * * 1-5"). Do NOT wrap it in markdown code blocks, backticks, or quotes. Do NOT include any explanation or text before or after the expression.'
    }

    if (generationType === 'json-object') {
      finalSystemPrompt += '\n\nIMPORTANT: Return ONLY the raw JSON object. Do NOT wrap it in markdown code blocks (no ```json or ```). Do NOT include any explanation or text before or after the JSON. The response must start with { and end with }.'
    }

    const messages: ChatMessage[] = [{ role: 'system', content: finalSystemPrompt }]
    messages.push(...history.filter((msg) => msg.role !== 'system'))
    messages.push({ role: 'user', content: prompt })

    const apiUrl = `${wandBaseUrl.replace(/\/$/, '')}/chat/completions`
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${activeKey}` }

    if (stream) {
      try {
        logger.info(`[${requestId}] Creating stream with model=${wandModel} url=${apiUrl}`)

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: wandModel,
            messages,
            temperature: 0.2,
            max_tokens: 10000,
            stream: true,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          logger.error(`[${requestId}] API request failed`, { status: response.status, error: errorText })
          throw Object.assign(new Error(`API request failed: ${response.status}`), { status: response.status })
        }

        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        const readable = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader()
            if (!reader) { controller.close(); return }

            let finalUsage: any = null
            let usageRecorded = false

            const flushUsage = async () => {
              if (usageRecorded || !finalUsage) return
              usageRecorded = true
              await updateUserStatsForWand(billingUserId, workspaceId, finalUsage, requestId, isBYOK)
            }

            try {
              let buffer = ''
              let chunkCount = 0

              while (true) {
                const { done, value } = await reader.read()
                if (done) {
                  logger.info(`[${requestId}] Stream completed. Total chunks: ${chunkCount}`)
                  await flushUsage()
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
                  controller.close()
                  break
                }

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                  const trimmed = line.trim()
                  if (!trimmed || !trimmed.startsWith('data:')) continue
                  const data = trimmed.slice(5).trim()
                  if (data === '[DONE]') {
                    await flushUsage()
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
                    controller.close()
                    return
                  }

                  let parsed: any
                  try { parsed = JSON.parse(data) } catch { continue }

                  // Chat Completions streaming format: choices[0].delta.content
                  const choice = parsed?.choices?.[0]
                  if (choice?.delta?.content) {
                    chunkCount++
                    if (chunkCount === 1) logger.info(`[${requestId}] Received first content chunk`)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: choice.delta.content })}\n\n`))
                  }

                  // Usage comes on the last chunk (with finish_reason)
                  const usage = extractChatCompletionsUsage(parsed)
                  if (usage) finalUsage = usage
                }
              }
            } catch (streamError: any) {
              logger.error(`[${requestId}] Streaming error`, { message: streamError?.message })
              try { await flushUsage() } catch {}
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Streaming failed', done: true })}\n\n`))
              controller.close()
            } finally {
              reader.releaseLock()
            }
          },
          cancel() {},
        })

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      } catch (error: any) {
        logger.error(`[${requestId}] Failed to create stream`, { message: error?.message, status: error?.status })
        return NextResponse.json({ success: false, error: 'An error occurred during wand generation streaming.' }, { status: 500 })
      }
    }

    // Non-streaming path
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: wandModel,
        messages,
        temperature: 0.2,
        max_tokens: 10000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const apiError = Object.assign(new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`), { status: response.status })
      throw apiError
    }

    const completion = await response.json()
    const generatedContent = completion?.choices?.[0]?.message?.content?.trim()

    if (!generatedContent) {
      logger.error(`[${requestId}] Response was empty or invalid.`)
      return NextResponse.json({ success: false, error: 'Failed to generate content. AI response was empty.' }, { status: 500 })
    }

    logger.info(`[${requestId}] Wand generation successful`)

    const usage = extractChatCompletionsUsage(completion)
    if (usage) {
      await updateUserStatsForWand(billingUserId, workspaceId, usage, requestId, isBYOK)
    }

    return NextResponse.json({ success: true, content: generatedContent })
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500
    logger.error(`[${requestId}] Wand generation failed`, { message: error?.message, status })

    let clientErrorMessage = 'Wand generation failed. Please try again later.'
    if (status === 401) {
      clientErrorMessage = 'Authentication failed. Please check your API key configuration.'
    } else if (status === 429) {
      clientErrorMessage = 'Rate limit exceeded. Please try again later.'
    } else if (status >= 500) {
      clientErrorMessage = 'The wand generation service is currently unavailable. Please try again later.'
    }

    return NextResponse.json({ success: false, error: clientErrorMessage }, { status })
  }
})
