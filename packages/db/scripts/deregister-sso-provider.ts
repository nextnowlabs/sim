#!/usr/bin/env bun

/**
 * Deregister SSO Provider Script
 *
 * This script removes an SSO provider from the database.
 *
 * Usage: bun run packages/db/scripts/deregister-sso-provider.ts
 *
 * Required Environment Variables:
 *   DATABASE_URL=your-database-url
 *   SSO_PROVIDER_ID=provider-id (optional, if not provided will remove all providers)
 */

import { getErrorMessage } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { ssoProvider } from '../schema'

const logger = {
  info: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString()
    console.log(
      `[${timestamp}] [INFO] [DeregisterSSODB] ${message}`,
      meta ? JSON.stringify(meta, null, 2) : ''
    )
  },
  error: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString()
    console.error(
      `[${timestamp}] [ERROR] [DeregisterSSODB] ${message}`,
      meta ? JSON.stringify(meta, null, 2) : ''
    )
  },
  warn: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString()
    console.warn(
      `[${timestamp}] [WARN] [DeregisterSSODB] ${message}`,
      meta ? JSON.stringify(meta, null, 2) : ''
    )
  },
}

const CONNECTION_STRING = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
if (!CONNECTION_STRING) {
  console.error('❌ POSTGRES_URL or DATABASE_URL environment variable is required')
  process.exit(1)
}

const postgresClient = postgres(CONNECTION_STRING, {
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 30,
  max: 10,
  onnotice: () => {},
})
const db = drizzle(postgresClient)

async function deregisterSSOProvider(): Promise<boolean> {
  try {
    const specificProviderId = process.env.SSO_PROVIDER_ID

    if (specificProviderId) {
      const providers = await db
        .select()
        .from(ssoProvider)
        .where(eq(ssoProvider.providerId, specificProviderId))

      if (providers.length === 0) {
        logger.warn(`No SSO provider found with ID: ${specificProviderId}`)
        return false
      }

      await db
        .delete(ssoProvider)
        .where(eq(ssoProvider.providerId, specificProviderId))

      logger.info(
        `✅ Successfully deleted SSO provider '${specificProviderId}'`
      )
    } else {
      const providers = await db.select().from(ssoProvider)

      if (providers.length === 0) {
        logger.warn('No SSO providers found in the database')
        return false
      }

      logger.info(`Found ${providers.length} SSO provider(s)`)
      for (const provider of providers) {
        logger.info(`  - Provider ID: ${provider.providerId}, Domain: ${provider.domain}`)
      }

      await db.delete(ssoProvider)

      logger.info(
        `✅ Successfully deleted all ${providers.length} SSO provider(s)`
      )
    }

    return true
  } catch (error) {
    logger.error('❌ Failed to deregister SSO provider:', {
      error: getErrorMessage(error, 'Unknown error'),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return false
  } finally {
    try {
      await postgresClient.end({ timeout: 5 })
    } catch {}
  }
}

async function main() {
  console.log('🗑️  Deregister SSO Provider Script')
  console.log('====================================')
  console.log('This script removes SSO provider records from the database.\n')

  const success = await deregisterSSOProvider()

  if (success) {
    console.log('\n🎉 SSO provider deregistration completed successfully!')
    process.exit(0)
  } else {
    console.log('\n💥 SSO deregistration failed. Check the logs above for details.')
    process.exit(1)
  }
}

main().catch((error) => {
  logger.error('Script execution failed:', { error })
  process.exit(1)
})