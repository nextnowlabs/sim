## 1. Inventory & Freeze

- [x] 1.1 Grep entire repo for `@/app/(landing)` imports and `lib/blog`/`lib/landing` consumers; enumerate the full fix list (expected: ~6 import sites)
- [x] 1.2 Verify consumers of `lib/posthog/client`, `gtag`/`dataLayer` (app/layout.tsx), `.claude/rules/constitution.md`, and `app/manifest.ts` to confirm which die and which survive
- [x] 1.3 Run baseline checks (`bun run check:typecheck`, route tests) to have a clean pre-change reference

## 2. Extract Brand Components

- [x] 2.1 Create `apps/sim/components/brand/` with kebab-case files + `index.ts` barrel holding `LogoShell`, `LogoMark`, `SimWordmark`
- [x] 2.2 Update import sites: `app/not-found.tsx`, `app/(auth)/components/auth-shell.tsx`, `app/f/[token]/public-file-view.tsx`, `app/f/[token]/public-file-auth-shell.tsx`, `app/(interfaces)/components/interfaces-shell/interfaces-shell.tsx`, `app/(interfaces)/chat/components/header/header.tsx`

## 3. Root Redirect

- [x] 3.1 Add `app/page.tsx` that reads the session and redirects authenticated users to their workspace root (reuse `app/workspace/page.tsx` resolution logic) and unauthenticated users to `/login`

## 4. Delete Marketing Surface

- [x] 4.1 Delete `apps/sim/app/(landing)/` route group entirely (all pages, sections, landing-preview components, CLAUDE.md)
- [x] 4.2 Delete marketing infrastructure: `app/robots.ts`, `app/sitemap.ts`, `app/seo.test.ts`, `app/llms.txt`, `app/llms-full.txt`, `app/changelog.xml`, `app/landing-preview/`, `landing-analytics.tsx`, `track-landing-cta.ts`, `og-utils.tsx`
- [x] 4.3 Delete `lib/blog/`, `lib/landing/` (including `BlogImage` and `mdx.tsx`)
- [x] 4.4 Strip `landingContent` from `lib/integrations/types.ts`; delete `lib/integrations/landing-content.ts`; update `lib/integrations/types.ts` references
- [x] 4.5 Remove GTM/GA script blocks from `app/layout.tsx` (~lines 206–237); remove dead `/integrations/incidentio` redirect from `next.config.ts` (keep `/workspace/:workspaceId/task/:chatId`)
- [x] 4.6 Delete orphaned `lib/posthog/client` usage if no product consumers remain (verify first)
- [x] 4.7 Remove landing-only rule files (`.claude/rules/landing-seo-geo.md`, constitution if landing-only) and any references in AGENTS.md

## 5. Verification

- [x] 5.1 Run `bun run check:typecheck` (or repo lint equivalent) and fix all remaining `(landing)` references
- [x] 5.2 Run route/API tests (`bun run test` or affected suites) — confirm nothing product-side regressed
- [ ] 5.3 Boot the app and walk: `/` logged-out → `/login`; `/` logged-in → workspace; `/pricing` → 404; `/login`, `/signup` render with logo; `/f/<token>` share page renders; workspace shell + chat header render
- [x] 5.4 Verify built HTML contains no GTM/GA scripts and confirm no `(landing)` or marketing references remain via repo grep
- [x] 5.5 Confirm `bun run check:api-validation` passes (contracts untouched, but sanity check)
