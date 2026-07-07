## Why

Self-hosters and enterprise deployments need to serve Sim behind a reverse proxy under a fixed subpath (`/sim`), coexisting with other applications on the same domain. The current architecture assumes root-path deployment (`/`); all client-side `fetch` calls, CORS origins, middleware redirects, and the realtime Socket.IO path assume no path prefix. Without subpath support, these deployments are impossible without fragile external rewrite layers that break `next/link` navigation.

## What Changes

- Hardcode Next.js `basePath: '/sim'` in `next.config.ts` (not configurable via env or build arg — the path is always `/sim`)
- Create a `withBasePath()` utility backed by a hardcoded `/sim` constant and prepend it to all client-side `fetch` URL construction: `requestJson`/`requestRaw` in `lib/api/client/request.ts` plus ~15 raw `fetch('/api/...')` call sites across hooks, components, and providers
- Fix middleware redirects in `proxy.ts` to include `request.nextUrl.basePath` when constructing redirect URLs (e.g., `new URL('/workspace', request.url)` currently drops the prefix)
- Fix CORS origin in `proxy.ts` (`resolveApiCorsPolicy`) to extract origin-only (no path) from `NEXT_PUBLIC_APP_URL`
- Fix Socket.IO CORS in `apps/realtime/src/config/socket.ts` (`getAllowedOrigins`) to extract origin-only from `getBaseUrl()`
- Update `apps/sim/lib/core/security/csp.ts` `connect-src` to use origin-only URL from `NEXT_PUBLIC_APP_URL`
- Update `docker-compose.prod.yml` and Helm `values.yaml` to document/set `NEXT_PUBLIC_APP_URL` with the `/sim` suffix and configure ingress paths (`/sim/*` → app, `/socket.io/*` → realtime)
- Socket.IO client and server keep default path `/socket.io/` (no subpath) — the reverse proxy routes `/socket.io/*` directly to the realtime service, outside the `/sim` prefix

## Capabilities

### New Capabilities

- `subpath-deployment`: Enables the application to be served under a fixed `/sim` base path, covering Next.js basePath configuration, client-side fetch prefixing, CORS origin normalization, middleware redirect awareness, and reverse proxy / ingress routing rules.

### Modified Capabilities

_(none — no existing specs to modify)_

## Impact

- **Build-time**: `next.config.ts` gains hardcoded `basePath: '/sim'`; Docker build bakes the prefix into the bundle. The image always serves under `/sim` — root-path deployment is not supported.
- **Client-side code**: `lib/api/client/request.ts` (requestJson/requestRaw) + 15+ raw `fetch` call sites in `hooks/`, `app/workspace/`, `lib/uploads/`, `lib/copilot/`, `instrumentation-client.ts` must prepend basePath.
- **Middleware**: `proxy.ts` redirect logic and CORS origin resolution.
- **Realtime server**: `apps/realtime/src/config/socket.ts` CORS origin normalization.
- **Security**: `lib/core/security/csp.ts` connect-src normalization.
- **Infrastructure**: docker-compose env vars, Helm ingress path rules.
- **External configuration**: OAuth provider callback URLs must be updated to include `/sim` prefix (e.g., `https://example.com/sim/api/auth/callback/github`). This is a deployment documentation change, not a code change.
