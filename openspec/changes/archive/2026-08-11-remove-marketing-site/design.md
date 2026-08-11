## Context

Sim is deployed as a private, internal-network instance. Today the Next.js app serves the entire public marketing site at `/` via the `(landing)/` route group, wrapped in `LandingShell` (light tokens, Navbar with GitHub stars, Footer, site-wide JSON-LD). In the hosted deployment an external proxy redirects `/` → `/login` for logged-out users; the self-hosted nginx (`nginx/default.conf`) passes `/` straight through, so the landing page renders in private deployments too.

The marketing site is entangled with product surfaces: `LogoShell`, `LogoMark`, `SimWordmark` are imported by `not-found.tsx`, the auth shell, public file sharing (`f/[token]`), and the chat header. The marketing chrome must be removed without breaking those.

## Goals / Non-Goals

**Goals:**
- Remove all marketing pages and marketing-only code from the shipped app.
- Keep every product surface working: auth (login + open signup), workspace, chat, public file sharing, academy, realtime, APIs.
- Make `/` behave sensibly on a private instance: authenticated → workspace, unauthenticated → login.
- Eliminate external tracking (GTM/GA) and SEO output (sitemap, robots, llms.txt) that are meaningless on an intranet.

**Non-Goals:**
- Not removing public file sharing (`f/[token]`, share APIs, `public_share` table) — explicitly deferred.
- Not changing the hardcoded `SITE_URL` in `lib/core/utils/urls.ts` or any other deployment/env configuration (pre-existing, out of scope).
- Not removing PostHog *tool* integrations (`tools/posthog/*`) — those are product features used inside workflows.
- Not changing nginx/helm deployment configs — the root redirect is handled in-app.

## Decisions

### D1. Delete the whole `(landing)/` route group rather than disabling routes

Alternative: keep the code and redirect marketing routes from nginx (option A). Rejected — this is a self-owned fork with no upstream sync, so carrying ~290 files of dead marketing code and its marketing-theme rules has no value. Delete is the cleaner end state.

### D2. Extract exactly four brand components + one OG utility to shared locations

`LogoShell`, `LogoMark`, `SimWordmark`, `SimLogoFull` move from `@/app/(landing)/components/...` to a new `@/components/brand/` folder (kebab-case files + `index.ts` barrel, matching repo conventions), together with the `ThinkingLoader` component + its CSS module (a hidden dependency of `LogoMark`). The generic branded OG card builder moves from `app/(landing)/og-utils.tsx` to `apps/sim/lib/og/og-image.tsx` as `createBrandedOgImage` — it is still consumed by the public file share's `opengraph-image.tsx`. `BlogImage`, `models/utils`, `LandingShell`, landing-preview components all die with their marketing consumers.

Update import sites (6 files):
- `app/not-found.tsx` → `LogoShell`
- `app/(auth)/components/auth-shell.tsx` → `LogoMark`, `SimWordmark`
- `app/f/[token]/public-file-view.tsx` + `public-file-auth-shell.tsx` → `SimWordmark`
- `app/(interfaces)/components/interfaces-shell/interfaces-shell.tsx` → `LogoShell`
- `app/(interfaces)/chat/components/header/header.tsx` → logo component (verify which)

### D3. New root page `app/page.tsx` with session-aware redirect

The route group is deleted, so `/` needs a new owner. Implement a small server component/page that reads the session (`getSession` from `@/lib/auth`) and redirects:
- authenticated → first workspace (`/workspace/<workspaceId>` or the existing workspace-root resolution logic)
- unauthenticated → `/login`

Verify against existing workspace-root behavior (`app/workspace/page.tsx`) to avoid duplicating workspace resolution.

### D4. Strip `landingContent` from the integrations registry, keep the registry

`lib/integrations/types.ts` and `landing-content.ts` are shared with the workspace (tool registry). Remove the `landingContent` field and the landing-content data file; the `Integration` type and registry entries stay. `scripts/generate-docs.ts` (which bakes the landing content into `integrations.json`) and `scripts/README.md` are stripped of the same field/load path — the script keeps generating docs and `integrations.json` for the workspace.

### D5. Remove marketing infrastructure and external scripts

- Delete `app/robots.ts`, `app/sitemap.ts`, `app/seo.test.ts`, `app/llms.txt`, `app/llms-full.txt`, `app/changelog.xml`, `app/landing-preview/`, `landing-analytics.tsx`, `track-landing-cta.ts`, `og-utils.tsx`, `lib/blog/`, `lib/landing/`.
- Remove the GTM/GA script blocks from `app/layout.tsx` (~lines 206–237) — keeps the app self-contained on an intranet (no failed external requests, no external data egress).
- Remove the `/integrations/incidentio` → `/integrations/incident-io` redirect from `next.config.ts` (target route deleted). Keep the `/workspace/:workspaceId/task/:chatId` redirect (product feature).
- Delete `app/(landing)/CLAUDE.md` and the landing-only rules it references (`.claude/rules/landing-seo-geo.md`, constitution if only consumed there — verify).

### D6. `app/manifest.ts`, `security.txt`, `not-found.tsx` stay

`manifest.ts` is PWA metadata for the product; `security.txt` is harmless and kept (no cost on intranet); `not-found.tsx` is retained for the product's 404 experience (import path updated to `@/components/brand`).

## Risks / Trade-offs

- [Hidden consumers of `(landing)/` internals beyond the six known import sites] → Before deleting, run a repo-wide grep for `@/app/(landing)`; fix all references; run `bun run check:typecheck` and the affected test suites (`seo.test.ts` is deleted, but API/route tests must pass). Resolved during implementation: eight import sites total (including `f/[token]/opengraph-image.tsx` → `lib/og/og-image.tsx` and `academy/(catalog)/layout.tsx`); post-delete grep is clean.
- [Root redirect misbehavior (loop or wrong destination)] → Follow the existing workspace-root resolution in `app/workspace/page.tsx`; hand-test logged-in and logged-out flows.
- [Removing GA scripts touches shared `app/layout.tsx`] → Small, surgical edit; verify no other feature reads GA event hooks (grep for `gtag`/`dataLayer` before removal).
- [Deleting `lib/blog/mdx.tsx` breaks something unexpected] → Grep for `lib/blog` consumers first; confirmed consumers are all inside `(landing)/blog` and sitemap — double-check at execution time.
- [PostHog client (`lib/posthog/client`) left orphaned after landing-analytics deletion] → Grep for remaining consumers; if none, delete the file or keep if shared with product features (verify, don't assume).

## Migration Plan

1. Grep the full repo for `@/app/(landing)` references and `lib/blog`/`lib/landing` imports; enumerate the complete fix list.
2. Move the three brand components to `@/components/brand/` and update the six import sites.
3. Add `app/page.tsx` root redirect.
4. Delete the `(landing)/` route group and all marketing infrastructure files.
5. Strip `landingContent` from `lib/integrations/`.
6. Remove GTM/GA from `app/layout.tsx` and the dead redirect from `next.config.ts`.
7. Verify: `bun run check:typecheck` (or repo lint), run route tests, boot the app and walk `/` (logged out → login; logged in → workspace), a marketing URL (→ login/404), and a public file share link.
8. Rollback: revert the change (delete is git-revertable); no DB migration involved.

## Open Questions

- ~~Does `app/(interfaces)/chat/components/header/header.tsx` use `LogoMark`/`SimWordmark` or another logo variant?~~ → `SimWordmark`; resolved.
- ~~Is `.claude/rules/constitution.md` consumed only by the landing family, or also by product copy?~~ → Shared (settings pages); kept. `landing-seo-geo.md`/`.mdc` deleted.
- ~~`app/manifest.ts`: confirm it is product PWA metadata, not marketing-only.~~ → Product PWA with whitelabeling; kept.
