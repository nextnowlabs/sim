## Context

Sim is a monorepo with two user-facing services: a Next.js app (`apps/sim`, port 3000) and a Bun Socket.IO server (`apps/realtime`, port 3002). In production they sit behind a reverse proxy (nginx / K8s ingress-nginx). The current architecture assumes root-path deployment — Next.js has no `basePath`, all client-side `fetch('/api/...')` calls use bare paths, CORS origins include the full `NEXT_PUBLIC_APP_URL` (which would carry a path suffix), and middleware redirects use `new URL('/workspace', request.url)` which drops any path prefix.

Self-hosters and enterprise deployments need to serve Sim under a fixed subpath `/sim` on a shared domain (e.g., `https://corp.example.com/sim/`), coexisting with other applications. Next.js `basePath` is a build-time constant — it cannot be toggled at runtime — so the prefix must be baked into the Docker image. The realtime Socket.IO server keeps its default path `/socket.io/` at the root level (not under `/sim`), routed directly by the reverse proxy.

Key constraint: `next/link`, `next/router`, `next/image`, and `next/script` automatically respect `basePath`. Raw `fetch()` calls do not. There are ~15 raw `fetch('/api/...')` call sites plus the `requestJson`/`requestRaw` infrastructure that constructs URLs from contract `path` properties.

## Goals / Non-Goals

**Goals:**
- Serve the full Sim application (pages, API routes, static assets, public files) under `/sim` via Next.js `basePath`
- Keep Socket.IO at `/socket.io/` (root level, not prefixed) — the reverse proxy routes it directly to the realtime service
- All client-side `fetch` calls (requestJson, requestRaw, and raw fetch sites) reach the correct `/sim/api/...` endpoints
- CORS origins (API and Socket.IO) are origin-only (no path) so browsers match them correctly
- Middleware redirects preserve the basePath
- CSP `connect-src` uses origin-only URLs
- Reverse proxy / Helm ingress rules are documented and correct

**Non-Goals:**
- Configurable subpath — the path is hardcoded to `/sim` and cannot be changed via env var, build arg, or runtime configuration. Root-path (`/`) deployment is not supported by this build.
- Subpath for the realtime Socket.IO server — it stays at `/socket.io/` regardless of app subpath
- Subpath for the copilot service — out of scope for this change
- Automatic OAuth provider callback URL updates — this is a deployment configuration task, documented but not automated

## Decisions

### D1: Hardcoded `basePath: '/sim'`

**Choice**: Hardcode `basePath: '/sim'` directly in `next.config.ts`. No env var, no build arg — the path is always `/sim`.

**Rationale**: The subpath is a product-level constant, not a deployment variable. Hardcoding eliminates an entire class of misconfiguration (wrong env var, empty string, trailing slash). The Docker image always serves under `/sim`; root-path deployment is simply not a supported mode for this build.

**Alternatives considered**:
- *Env-var-driven basePath (`process.env.NEXT_PUBLIC_BASE_PATH`)*: Adds flexibility that isn't needed — the requirement is a fixed `/sim`. Adds risk of misconfiguration (empty string, wrong value). Rejected as unnecessary indirection.
- *Runtime basePath via middleware rewrite*: Not possible — Next.js doesn't support runtime basePath. Middleware rewrites can strip prefixes but `next/link` would still generate unprefixed URLs, breaking client-side navigation.
- *Reverse proxy strips prefix, no basePath*: Breaks `next/link` — links would point to `/workspace` instead of `/sim/workspace`, losing the prefix on every client-side navigation.

### D2: `withBasePath()` utility for all client-side fetch URLs

**Choice**: Create `lib/core/utils/base-path.ts` exporting a hardcoded `BASE_PATH = '/sim'` constant and `withBasePath(path: string): string` that prepends `BASE_PATH` to paths starting with `/`. Apply it in:
- `requestJson` / `requestRaw` in `lib/api/client/request.ts` (single point — covers all React Query hooks)
- Each of the ~15 raw `fetch('/api/...')` call sites

**Rationale**: Explicit, auditable, no magic. Each call site is aware of the prefix. Future code reviews can catch missing `withBasePath()` calls. The utility is a pure string prepend — no side effects, no global state.

**Alternatives considered**:
- *Fetch interceptor (monkey-patch `window.fetch`)*: Single change point but hides the prefix logic from call sites, making debugging harder and potentially affecting third-party libraries. Rejected for opacity.
- *Next.js rewrites with `basePath: false`*: Could map bare `/api/:path*` to the API routes, but middleware `matcher` patterns are auto-prefixed with basePath and cannot match bare paths — CORS middleware would be bypassed for unprefixed API calls. Rejected for middleware incompatibility.

### D3: CORS origin extraction — origin-only, no path

**Choice**: Add a helper `getOriginFromUrl(url: string): string` that returns `new URL(url).origin` (protocol + host + port, no path). Use it in:
- `proxy.ts` `resolveApiCorsPolicy()` — default CORS origin from `NEXT_PUBLIC_APP_URL`
- `apps/realtime/src/config/socket.ts` `getAllowedOrigins()` — Socket.IO CORS from `getBaseUrl()`
- `lib/core/security/csp.ts` — `connect-src` entries from `NEXT_PUBLIC_APP_URL`

**Rationale**: When `NEXT_PUBLIC_APP_URL` is `https://example.com/sim`, CORS origins must be `https://example.com` (no path). Browsers send `Origin: https://example.com` and compare strictly. Including a path causes mismatch and blocks all cross-origin requests (embedded chats, OAuth callbacks from other domains).

### D4: Middleware redirect URLs include basePath

**Choice**: In `proxy.ts`, replace `new URL('/workspace', request.url)` patterns with `new URL(`${request.nextUrl.basePath}/workspace`, request.url)`. Next.js provides `request.nextUrl.basePath` (stripped from `pathname`, available as a property) when `basePath` is configured.

**Rationale**: `new URL('/workspace', 'https://example.com/sim/...')` resolves to `https://example.com/workspace` (absolute path replaces everything). Prepending `basePath` preserves the prefix: `https://example.com/sim/workspace`.

**Note**: Middleware `matcher` patterns and `headers()` source patterns are auto-prefixed by Next.js when `basePath` is set — no changes needed there. Inside the middleware, `request.nextUrl.pathname` is already stripped of basePath, so path-matching logic (e.g., `url.pathname.startsWith('/api/')`) works unchanged.

### D5: Socket.IO stays at `/socket.io/` — no subpath

**Choice**: The Socket.IO client connects to `window.location.origin` (e.g., `https://example.com`) with the default path `/socket.io/`. The reverse proxy routes `/socket.io/*` directly to the realtime service, outside the `/sim` prefix.

**Rationale**: Keeps the realtime server configuration unchanged (no `path` option needed on server or client). The browser's `window.location.origin` is `https://example.com` (no path) regardless of the page's subpath, so `getSocketUrl()` already returns the correct origin. Socket.IO appends `/socket.io/` automatically.

**Alternatives considered**:
- *Socket.IO under `/sim/socket.io/`*: Would require setting `path: '/sim/socket.io'` on both client and server, plus ingress routing for `/sim/socket.io/*`. More moving parts for no benefit since the realtime service is independent of the app's path namespace.

### D6: `INTERNAL_API_BASE_URL` includes the subpath

**Choice**: Server-side internal API self-calls (via `getInternalApiBaseUrl()`) must target `http://sim-app:3000/sim` (with subpath) in K8s, because Next.js with `basePath` expects all incoming requests to include the prefix. The internal K8s Service URL is different from the public URL but must carry the same path prefix.

**Rationale**: Next.js with `basePath: '/sim'` rejects requests to `/api/...` (404) — only `/sim/api/...` matches. Internal cluster calls bypass the reverse proxy and hit the Service directly, so they must include the prefix manually.

### D7: Helm ingress

**Choice**: 
- Helm `values.yaml`: Document that `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` must include `/sim` suffix. Ingress paths: `app.paths` → `/sim` (Prefix), `realtime.paths` → `/socket.io` (Prefix). Realtime paths must be listed before app paths in the same host rule (more specific first).
- No Docker build arg changes — `basePath` is hardcoded in `next.config.ts`, not passed via env.

**Rationale**: Since `basePath` is hardcoded, the Dockerfile needs no changes — `next build` reads `next.config.ts` directly. The Helm ingress template already supports custom paths via values; no template changes needed, just documentation and default updates.

## Risks / Trade-offs

- **[Root-path deployment not supported]** → This build always serves under `/sim`. If root-path deployment is needed in the future, a code change (not just config) is required. This is intentional — the product requirement is fixed `/sim`.
- **[Missing `withBasePath()` on a new fetch call]** → Future code that adds a raw `fetch('/api/...')` without `withBasePath()` will 404. Mitigation: add a lint rule or audit script that flags `fetch('/api/` without `withBasePath()` in non-test files.
- **[OAuth callback URL drift]** → External OAuth providers (Google, GitHub, etc.) must have callback URLs updated to include `/sim`. This is a per-deployment configuration task. Mitigation: document in deployment guide.
- **[Better Auth redirect URLs]** → Better Auth uses `BETTER_AUTH_URL` as its base. If it generates redirect URLs by appending paths to this base, the `/sim` prefix is included correctly. If it uses request URL to derive the base, it may strip the prefix. Needs verification during implementation.
- **[Webhook URLs carry subpath]** → Webhook trigger URLs generated by `getBaseUrl()` will be `https://example.com/sim/api/webhooks/trigger/...`. External services calling these must route through the reverse proxy, which handles `/sim/*`. This is correct behavior but changes existing webhook URLs — deployed workflows with registered webhooks may need URL updates.

## Migration Plan

1. **Build and test locally**: Set `NEXT_PUBLIC_APP_URL=http://localhost:3000/sim` in `.env.local`, run `bun run dev`, verify pages and API calls work under `/sim`.
2. **Deploy to staging**: Build Docker image (basePath is hardcoded, no special build args), deploy behind a reverse proxy configured with `/sim/*` → app and `/socket.io/*` → realtime.
3. **Update OAuth providers**: Add `/sim`-prefixed callback URLs to Google, GitHub, and other OAuth app configurations.
4. **Update existing webhooks**: Any deployed workflows with registered webhook URLs need the URLs updated to include `/sim` (or the reverse proxy must handle the old URLs).
5. **Rollback**: Revert the code change (remove hardcoded basePath) and rebuild. No database migration to reverse.

## Open Questions

- **Better Auth basePath handling**: Does Better Auth's Next.js handler correctly generate redirect URLs that include the basePath when `BETTER_AUTH_URL` includes a path? Needs verification during implementation — may require setting `basePath` in Better Auth config or using `next/navigation` redirects instead of raw URL construction.
- **`ensureAbsoluteUrl()` behavior**: This function (`urls.ts:61`) prepends `getBaseUrl()` to relative paths. With `NEXT_PUBLIC_APP_URL=https://example.com/sim`, it produces `https://example.com/sim/api/...` — correct for external consumers (webhooks, OAuth). But server-side internal calls using this function would also get the public URL with subpath, which may not match `INTERNAL_API_BASE_URL`. Need to audit call sites to ensure server-side internal calls use `getInternalApiBaseUrl()` not `getBaseUrl()`.
