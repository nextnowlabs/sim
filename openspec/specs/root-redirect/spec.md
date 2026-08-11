# root-redirect Specification

## Purpose
Sim is deployed privately on an internal network, so the public marketing site has no purpose. The `(landing)/` route group and its supporting marketing infrastructure (SEO files, analytics scripts) are removed, and the root path no longer renders a marketing home page. Instead `/` redirects based on the caller's session, while all product surfaces (auth, workspace, collaboration, public file sharing) keep working after the removal.

## Requirements
### Requirement: Root path redirects by session state

The system SHALL NOT render the marketing home page at `/`. The root path MUST redirect based on the caller's session: authenticated users go to their workspace, unauthenticated users go to `/login`.

#### Scenario: Unauthenticated visitor hits root
- **WHEN** an unauthenticated user requests `/`
- **THEN** the system responds with a redirect to `/login`

#### Scenario: Authenticated user hits root
- **WHEN** an authenticated user requests `/`
- **THEN** the system responds with a redirect to their workspace root

#### Scenario: Marketing URLs after removal
- **WHEN** a user requests a previously-marketing URL (e.g. `/pricing`, `/blog`, `/integrations/<slug>`)
- **THEN** the system responds with 404 (no marketing routes exist)

### Requirement: No marketing code in the shipped app

The system SHALL NOT ship any marketing-page routes, marketing-only components, SEO output routes, or external tracking scripts as part of the deployed app.

#### Scenario: Marketing route group deleted
- **WHEN** the app is built
- **THEN** no route under `app/(landing)/` exists in the build and no `app/(landing)/` directory remains in the codebase

#### Scenario: No SEO or analytics output
- **WHEN** a user requests `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`, or `/changelog.xml`
- **THEN** the system does not serve those routes (404 or non-existent)

#### Scenario: No external tracking scripts
- **WHEN** the app's HTML is rendered
- **THEN** it contains no Google Tag Manager / Google Analytics script tags

### Requirement: Product surfaces keep working after removal

The removal of the marketing site MUST NOT break product surfaces that previously reused marketing chrome: login/signup pages, the 404 page, the app shell, the chat header, and public file sharing pages. These surfaces MUST render the brand logo from the shared `@/components/brand/` module.

#### Scenario: Auth pages render
- **WHEN** a user visits `/login` or `/signup`
- **THEN** the pages render with the brand logo and no missing-import errors

#### Scenario: Public file share renders
- **WHEN** an unauthenticated user visits a valid public share URL under `/f/<token>`
- **THEN** the share page renders with the brand wordmark and no missing-import errors

#### Scenario: 404 and app shell render
- **WHEN** a user visits a non-existent path or the authenticated app shell
- **THEN** the pages render with the brand logo and no missing-import errors

### Requirement: Integration registry keeps product data

The workspace integration registry SHALL retain all integration entries and their product-facing fields after the removal of marketing-only `landingContent` data.

#### Scenario: Integration registry intact
- **WHEN** the app loads the integration registry
- **THEN** all integration entries remain available with their product fields, and no `landingContent` references remain anywhere in the codebase
