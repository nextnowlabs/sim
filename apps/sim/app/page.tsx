import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Root of a private deployment — there is no marketing site, so `/` resolves
 * by session: authenticated users go to the workspace root (which performs
 * recency-aware workspace resolution and creation-policy handling), everyone
 * else to the login page.
 */
export default async function RootPage() {
  const session = await getSession()
  redirect(session?.user ? '/workspace' : '/login')
}
