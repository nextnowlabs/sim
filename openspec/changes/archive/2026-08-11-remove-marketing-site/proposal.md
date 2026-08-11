## Why

Sim will be deployed privately on an internal network, where the public marketing site has no purpose. The `(landing)/` route group (~290 files, the entire marketing surface: `/`, `/pricing`, `/blog`, `/integrations`, `/models`, `/enterprise`, `/solutions`, `/partners`, `/careers`, `/contact`, `/demo`, `/changelog`, legal pages) and its supporting marketing infrastructure (SEO files, analytics scripts) must be removed so the app serves only the product: auth, workspace, and collaboration.

## What Changes

- **BREAKING**: Delete the `apps/sim/app/(landing)/` route group — all marketing pages and the shared marketing chrome (Navbar, Footer, LandingShell, hero/features/cta sections, landing-preview components).
- **BREAKING**: `/` (root) no longer renders the marketing home page. Instead it redirects based on session: authenticated users to their workspace, unauthenticated users to `/login`.
- Delete marketing infrastructure: `app/robots.ts`, `app/sitemap.ts`, `app/seo.test.ts`, `app/llms.txt`, `app/llms-full.txt`, `app/changelog.xml`, `app/landing-preview/` scaffold, `landing-analytics.tsx`, `track-landing-cta.ts`, `og-utils.tsx`, `lib/blog/`, `lib/landing/`.
- Remove Google Tag Manager / Google Analytics script injection from `app/layout.tsx` (lines ~206–237).
- Remove the now-dead `next.config.ts` redirect for `/integrations/incidentio`.
- Extract the brand logo components (`LogoShell`, `LogoMark`, `SimWordmark`) to a new shared location (`@/components/brand/`) so product surfaces keep working.
- Strip the `landingContent` field from `lib/integrations/` types and delete `lib/integrations/landing-content.ts`; keep the integration registry itself (still used by the workspace).
- Keep untouched: workspace product, `(auth)` login/signup (open registration stays), public file sharing (`f/[token]`, share APIs, `public_share` table), realtime, all API routes.

## Capabilities

### New Capabilities

- `root-redirect`: session-aware redirect behavior for `/` after the marketing home page is removed.

### Modified Capabilities

- (none — no existing spec requirements change; the marketing site has no spec coverage)

## Impact

- **Code**: `apps/sim/app/(landing)/` deleted (~290 files); ~6 import sites updated (`app/not-found.tsx`, `app/(auth)/components/auth-shell.tsx`, `app/f/[token]/public-file-view.tsx`, `app/f/[token]/public-file-auth-shell.tsx`, `app/(interfaces)/components/interfaces-shell/interfaces-shell.tsx`, `app/(interfaces)/chat/components/header/header.tsx`).
- **Shared components**: `LogoShell`, `LogoMark`, `SimWordmark` moved from `@/app/(landing)/components/...` to `@/components/brand/`.
- **Data**: no DB schema changes, no migrations.
- **Dependencies**: `lib/posthog/client` usage in landing analytics removed; PostHog *tool* integrations (`tools/posthog/*`) are product features and stay.
- **Build/deploy**: smaller bundle and static output; nginx `default.conf` needs no change (root redirect handled in-app); `SITE_URL` hardcoded value in `lib/core/utils/urls.ts` is pre-existing and out of scope.
- **Docs/rules**: delete `app/(landing)/CLAUDE.md`, landing SEO/GEO rules and constitution rules referenced by it.
