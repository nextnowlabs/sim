## ADDED Requirements

### Requirement: Application served under fixed base path

The system SHALL hardcode Next.js `basePath` to `/sim` in `next.config.ts`. All page routes, API routes, static assets (`_next/static/*`), and public files SHALL be served under the `/sim` prefix. The base path SHALL NOT be configurable via environment variable or build argument.

#### Scenario: Pages served under /sim

- **WHEN** a user navigates to `https://example.com/sim/workspace`
- **THEN** the Next.js app renders the workspace page

#### Scenario: Static assets include base path

- **WHEN** the application is built
- **THEN** the generated HTML references assets at `/sim/_next/static/...`
- **AND** the browser successfully loads those assets

### Requirement: Client-side fetch calls include base path

The system SHALL prepend the hardcoded base path (`/sim`) to all client-side `fetch` calls that target same-origin API routes. A `withBasePath(path)` utility backed by a `BASE_PATH = '/sim'` constant SHALL be the single mechanism for this. The `requestJson` and `requestRaw` functions SHALL apply `withBasePath()` to the constructed URL before calling `fetch`. All raw `fetch('/api/...')` call sites SHALL use `withBasePath()` to construct the URL.

#### Scenario: requestJson includes base path

- **WHEN** a React Query hook calls `requestJson(contract, input)` with `contract.path = '/api/folders'`
- **THEN** the browser sends `GET /sim/api/folders`
- **AND** the API route responds successfully

#### Scenario: Raw fetch includes base path

- **WHEN** client code calls `fetch(withBasePath('/api/auth/socket-token'), ...)`
- **THEN** the browser sends `POST /sim/api/auth/socket-token`

#### Scenario: withBasePath preserves absolute URLs

- **WHEN** `withBasePath('https://external.com/api')` is called
- **THEN** the result is `https://external.com/api` (unchanged — no prefix for absolute URLs)

### Requirement: CORS origins are origin-only

The system SHALL extract the origin (protocol + host + port, no path) from `NEXT_PUBLIC_APP_URL` when setting CORS origins. This SHALL apply to both the Next.js middleware CORS policy (`resolveApiCorsPolicy`) and the Socket.IO server CORS configuration (`getAllowedOrigins`).

#### Scenario: API CORS origin is origin-only

- **WHEN** `NEXT_PUBLIC_APP_URL=https://example.com/sim`
- **AND** a cross-origin request triggers CORS preflight on an API route
- **THEN** the `Access-Control-Allow-Origin` response header is `https://example.com` (no path)

#### Scenario: Socket.IO CORS origin is origin-only

- **WHEN** `NEXT_PUBLIC_APP_URL=https://example.com/sim`
- **AND** the browser connects to the Socket.IO server
- **THEN** the Socket.IO CORS configuration includes `https://example.com` (no path) as an allowed origin
- **AND** the connection is accepted

### Requirement: Middleware redirects preserve base path

The system SHALL include the configured base path in all middleware redirect URLs. Redirects constructed via `new URL(path, request.url)` SHALL prepend `request.nextUrl.basePath` to the path segment.

#### Scenario: Root path redirect includes base path

- **WHEN** an unauthenticated user visits `https://example.com/sim/`
- **THEN** the middleware redirects to `https://example.com/sim/login` (not `https://example.com/login`)

#### Scenario: Authenticated user redirect includes base path

- **WHEN** an authenticated user visits `https://example.com/sim/`
- **THEN** the middleware redirects to `https://example.com/sim/workspace` (not `https://example.com/workspace`)

#### Scenario: Workspace auth redirect includes base path

- **WHEN** an unauthenticated user visits `https://example.com/sim/workspace`
- **THEN** the middleware redirects to `https://example.com/sim/login`

### Requirement: Socket.IO connection path is independent of app base path

The system SHALL serve Socket.IO connections at `/socket.io/` (the default Socket.IO path), regardless of the app's base path configuration. The Socket.IO client SHALL connect to `window.location.origin` with the default path. The reverse proxy SHALL route `/socket.io/*` directly to the realtime service, outside the app's base path prefix.

#### Scenario: Socket.IO connects at root path

- **WHEN** the app is served at `https://example.com/sim/workspace`
- **AND** the Socket.IO client initializes
- **THEN** the client connects to `wss://example.com/socket.io/` (not `wss://example.com/sim/socket.io/`)

#### Scenario: Realtime server path is unchanged

- **WHEN** the realtime server starts
- **THEN** the Socket.IO server uses the default path `/socket.io/`
- **AND** no `path` configuration option is set on the server

### Requirement: CSP connect-src uses origin-only URLs

The system SHALL use origin-only URLs (no path) from `NEXT_PUBLIC_APP_URL` in CSP `connect-src` directives. This applies to both build-time and runtime CSP generation.

#### Scenario: Runtime CSP connect-src is origin-only

- **WHEN** `NEXT_PUBLIC_APP_URL=https://example.com/sim`
- **AND** the runtime CSP is generated
- **THEN** the `connect-src` directive includes `https://example.com` (no path)

### Requirement: Internal API base URL includes base path

The system SHALL include the base path in `INTERNAL_API_BASE_URL` for server-side internal API self-calls. When the app is deployed under `/sim`, `INTERNAL_API_BASE_URL` SHALL be set to `http://<internal-host>:3000/sim` (with subpath) so that Next.js with `basePath` accepts the requests.

#### Scenario: Internal API call includes base path

- **WHEN** the app is deployed under `/sim`
- **AND** server-side code calls `getInternalApiBaseUrl()` to make an internal API self-call
- **THEN** the resulting URL includes `/sim` as a path prefix
- **AND** Next.js matches the request against its API route handlers

### Requirement: Docker build hardcodes base path

The Docker build SHALL produce an image that always serves the application under the `/sim` base path. The base path SHALL be hardcoded in `next.config.ts` and SHALL NOT be overridable via build arguments.

#### Scenario: Docker build always produces subpath image

- **WHEN** the Docker image is built
- **THEN** the resulting Next.js standalone bundle has `basePath: '/sim'` baked in
- **AND** no build argument exists to change or disable the base path

### Requirement: Reverse proxy routing for subpath deployment

The deployment infrastructure SHALL configure the reverse proxy with the following routing rules when the app is served under `/sim`:
- `/sim/*` → Next.js app (port 3000) — includes pages, API routes, static assets, public files
- `/socket.io/*` → Realtime service (port 3002) — must be evaluated before the `/sim/*` catch-all if on the same host

The realtime path rule SHALL be listed before the app catch-all in the same host to ensure correct priority.

#### Scenario: Reverse proxy routes app traffic

- **WHEN** a user requests `https://example.com/sim/workspace`
- **THEN** the reverse proxy forwards the request to the Next.js app service

#### Scenario: Reverse proxy routes Socket.IO traffic

- **WHEN** the browser initiates a WebSocket connection to `wss://example.com/socket.io/`
- **THEN** the reverse proxy forwards the request to the realtime service (not the Next.js app)
