## 1. Core Utilities

- [ ] 1.1 Create `apps/sim/lib/core/utils/base-path.ts` exporting `BASE_PATH = '/sim'` constant and `withBasePath(path: string): string` — prepends `BASE_PATH` to paths starting with `/`; returns absolute URLs (`http://...`, `https://...`) unchanged; returns non-path strings unchanged
- [ ] 1.2 Add `getOriginFromUrl(url: string): string` helper to `apps/sim/lib/core/utils/urls.ts` — returns `new URL(url).origin` (protocol + host + port, no path); handles invalid URLs gracefully
- [ ] 1.3 Write unit tests for `withBasePath` (relative path, absolute URL, empty string) and `getOriginFromUrl` (with path, without path, invalid URL)

## 2. Next.js Configuration

- [ ] 2.1 Hardcode `basePath: '/sim'` in `next.config.ts` in the `nextConfig` object (not via env var — direct string literal)
- [ ] 2.2 Verify that `headers()` source patterns are automatically prefixed by Next.js (no manual changes needed) — test with a `/sim` build
- [ ] 2.3 Verify that `redirects()` and `rewrites()` source paths are automatically prefixed — test `/sim/discord`, `/sim/favicon.ico` etc.

## 3. API Client — requestJson / requestRaw

- [ ] 3.1 Import `withBasePath` in `apps/sim/lib/api/client/request.ts`
- [ ] 3.2 Apply `withBasePath()` to the `url` variable in `requestJson` (line ~177, after `appendQuery(replacePathParams(...))`)
- [ ] 3.3 Apply `withBasePath()` to the `url` variable in `requestRaw` (line ~223, same pattern)
- [ ] 3.4 Update `apps/sim/lib/api/client/request.test.ts` to verify basePath is prepended to the fetch URL

## 4. Raw Fetch Call Sites — Hooks

- [ ] 4.1 `apps/sim/hooks/use-execution-stream.ts:260` — `fetch('/api/workflows/.../execute')` → `fetch(withBasePath('/api/workflows/.../execute'))`
- [ ] 4.2 `apps/sim/hooks/use-execution-stream.ts:350` — same pattern, second call site
- [ ] 4.3 `apps/sim/hooks/queries/resume-execution.ts:170` — `fetch('/api/resume/...')`
- [ ] 4.4 `apps/sim/hooks/queries/logs.ts:374` — `fetch('/api/workflows/.../execute')`
- [ ] 4.5 `apps/sim/hooks/queries/mothership-chats.ts:246` — `fetch('/api/mothership/chat?...')`
- [ ] 4.6 `apps/sim/hooks/queries/tables.ts:1420` — `fetch('/api/table/import-csv')`
- [ ] 4.7 `apps/sim/hooks/queries/tables.ts:1625` — `fetch('/api/table/.../import')`
- [ ] 4.8 `apps/sim/hooks/queries/workspace-files.ts:312` — `fetch('/api/workspaces/.../files')`

## 5. Raw Fetch Call Sites — Components & Providers

- [ ] 5.1 `apps/sim/app/workspace/providers/socket-provider.tsx:337` — `fetch('/api/auth/socket-token')`
- [ ] 5.2 `apps/sim/app/workspace/[workspaceId]/w/components/sidebar/components/help-modal/help-modal.tsx:107` — `fetch('/api/help')`
- [ ] 5.3 `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-workflow-execution.ts:577` — `fetch('/api/files/upload')`
- [ ] 5.4 `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/utils/workflow-execution-utils.ts:928` — `fetch('/api/workflows/.../execute')`
- [ ] 5.5 `apps/sim/app/workspace/[workspaceId]/home/hooks/use-chat.ts:3789` — `fetch('/api/mothership/chat/abort')`
- [ ] 5.6 `apps/sim/app/workspace/[workspaceId]/knowledge/hooks/use-knowledge-upload.ts:386` — `fetch('/api/knowledge/.../documents')`
- [ ] 5.7 `apps/sim/app/(interfaces)/chat/[identifier]/chat.tsx:280` — `fetch('/api/chat/...')`
- [ ] 5.8 `apps/sim/app/(interfaces)/chat/hooks/use-audio-streaming.ts:96` — `fetch('/api/proxy/tts/stream')`
- [ ] 5.9 `apps/sim/instrumentation-client.ts:75,86` — `fetch('/api/telemetry')` (two call sites)

## 6. Raw Fetch Call Sites — Upload & Copilot Libraries

- [ ] 6.1 `apps/sim/lib/uploads/client/api-fallback.ts:20` — `fetch('/api/files/upload')`
- [ ] 6.2 `apps/sim/lib/uploads/client/direct-upload.ts:337,388,401,505` — four multipart upload fetch calls (`/api/files/multipart?action=...`)
- [ ] 6.3 `apps/sim/lib/copilot/chat/process-contents.ts:412` — `fetch('/api/mothership/chat?...')`

## 7. Middleware — Redirects & CORS

- [ ] 7.1 In `apps/sim/proxy.ts` `handleRootPathRedirects()`, prepend `request.nextUrl.basePath` to redirect paths: `new URL('/workspace', request.url)` → `new URL(`${request.nextUrl.basePath}/workspace`, request.url)`
- [ ] 7.2 Fix the `/login` and `/signup` redirect in the main `proxy()` function (line ~252): same basePath prepend pattern
- [ ] 7.3 Fix the `/workspace` auth redirect (line ~268): same pattern
- [ ] 7.4 Fix `handleInvitationRedirects()` redirect URLs (line ~183): prepend basePath to `/login?callbackUrl=...`
- [ ] 7.5 In `resolveApiCorsPolicy()` (line ~93), replace `getEnv('NEXT_PUBLIC_APP_URL')` with `getOriginFromUrl(getEnv('NEXT_PUBLIC_APP_URL'))` for the default CORS origin
- [ ] 7.6 Verify middleware `matcher` patterns auto-prefix correctly with basePath (no code change expected)

## 8. CSP Normalization

- [ ] 8.1 In `apps/sim/lib/core/security/csp.ts` `buildTimeCSPDirectives`, replace `env.NEXT_PUBLIC_APP_URL || ''` in `connect-src` with origin-only extraction
- [ ] 8.2 In `generateRuntimeCSP()`, replace `appUrl` in `connect-src` with `getOriginFromUrl(appUrl)` (or equivalent, noting this file cannot import from `@/` — use local helper)
- [ ] 8.3 Verify CSP still allows same-origin API calls and WebSocket connections (covered by `'self'`)

## 9. Socket.IO Server CORS

- [ ] 9.1 In `apps/realtime/src/config/socket.ts` `getAllowedOrigins()`, wrap `getBaseUrl()` with origin extraction: `getOriginFromUrl(getBaseUrl())` or equivalent
- [ ] 9.2 Add the origin extraction helper to `apps/realtime/src/env.ts` or a shared utility accessible to the realtime app (cannot import from `apps/sim`)
- [ ] 9.3 Verify Socket.IO accepts connections from the browser origin when `NEXT_PUBLIC_APP_URL` includes a path

## 10. Docker Build

- [ ] 10.1 Verify the existing Docker build produces a standalone bundle with `basePath: '/sim'` baked in (no Dockerfile changes needed — basePath is hardcoded in `next.config.ts`)

## 11. Docker Compose & Helm

- [ ] 11.1 In `docker-compose.prod.yml`, document `NEXT_PUBLIC_APP_URL` with `/sim` suffix in comments/env defaults
- [ ] 11.2 In `helm/sim/values.yaml`, update `app.envDefaults` documentation to note `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` must include `/sim` suffix
- [ ] 11.3 In `helm/sim/values.yaml`, update `ingress.app.paths` default to `/sim` (Prefix) and `ingress.realtime.paths` to `/socket.io` (Prefix) for the subpath deployment example
- [ ] 11.4 In `helm/sim/examples/values-production.yaml`, add a commented subpath deployment example showing `/sim` paths and `/sim`-suffixed `NEXT_PUBLIC_APP_URL`

## 12. Better Auth Verification

- [ ] 12.1 Verify Better Auth generates redirect URLs with the basePath when `BETTER_AUTH_URL=https://example.com/sim` — test login flow, OAuth callback flow
- [ ] 12.2 If Better Auth drops the path prefix in redirects, configure `basePath` in the Better Auth config or adjust redirect construction
- [ ] 12.3 Verify `ensureAbsoluteUrl()` in `urls.ts` produces correct URLs for external consumers (webhooks, OAuth) with the subpath
- [ ] 12.4 Audit server-side internal API call sites to ensure they use `getInternalApiBaseUrl()` (not `getBaseUrl()`) for self-calls

## 13. Documentation

- [ ] 13.1 Update `apps/sim/.env.example` to note that `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` must include the `/sim` suffix
- [ ] 13.2 Update `apps/realtime/.env.example` to note `NEXT_PUBLIC_APP_URL` may include a subpath (CORS is origin-only)
- [ ] 13.3 Document OAuth callback URL update requirement in deployment docs (callback URLs need `/sim` prefix)

## 14. Lint / Audit Script

- [ ] 14.1 Create or extend an audit script (`scripts/check-subpath-fetch.ts`) that flags `fetch('/api/` or `fetch(\`/api/` in non-test files under `apps/sim/` that don't use `withBasePath()` — prevents future regressions
- [ ] 14.2 Run the audit and fix any remaining call sites found

## 15. Testing

- [ ] 15.1 Run `bun run check:api-validation` to ensure no contract violations introduced
- [ ] 15.2 Run `bun run check:api-validation:strict` for the strict CI gate
- [ ] 15.3 Run existing test suite (`bun run test`) — verify no regressions in `urls.test.ts`, `request.test.ts`, and middleware tests
- [ ] 15.4 Manual test: build the app, serve behind a local reverse proxy (nginx or `caddy`), verify page navigation, API calls, Socket.IO connection, file uploads, OAuth login, and webhook triggers all work under `/sim`
