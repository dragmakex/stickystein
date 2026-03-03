# LEARNINGS.md

Append-only record of problems, incidents, and corrective actions.
Log every significant failure, regression, integration issue, or security concern.

## Entry Template
- Date/Time (UTC):
- Area:
- What happened:
- Impact:
- Root cause:
- Fix implemented:
- Prevention/guardrail:
- Tests added/updated:
- Related commit(s):

## Entries

### 2026-02-25T00:00:00Z - Initialization
- Area: Project process
- What happened: Created baseline learnings log requirement.
- Impact: No runtime impact.
- Root cause: Needed explicit failure tracking from the start.
- Fix implemented: Added `LEARNINGS.md` with mandatory entry template.
- Prevention/guardrail: Require logging future failures and mitigations here.
- Tests added/updated: N/A
- Related commit(s): N/A

### 2026-02-25T22:45:00Z - Effect Solutions setup command mismatch
- Area: Effect setup automation
- What happened: `effect-solutions setup` failed because the installed CLI exposes only `list`, `show`, and `open-issue`.
- Impact: `.reference/effect` could not be initialized via the documented command.
- Root cause: Local CLI version does not include the `setup` subcommand expected by the project prompt.
- Fix implemented: Continued with `effect-solutions list/show` guidance and documented the gap for manual follow-up.
- Prevention/guardrail: Add a preflight check for supported subcommands before depending on setup automation.
- Tests added/updated: N/A
- Related commit(s): pending

### 2026-02-25T23:15:00Z - Message cursor nullability regression during hardening
- Area: API pagination typing
- What happened: TypeScript failed after introducing decoded message cursors because `null` was passed to a function expecting `undefined` or cursor object.
- Impact: `tsc --noEmit` failed in CI/check workflow.
- Root cause: Cursor decode helper returns `null` for invalid input, but route handler passed that value directly.
- Fix implemented: Added explicit `decodedCursor ?? undefined` normalization and kept invalid cursor rejection path.
- Prevention/guardrail: Keep cursor decode return types normalized before passing to service-layer signatures.
- Tests added/updated: Existing full `bun run check` validation + new pagination unit tests.
- Related commit(s): pending

### 2026-02-25T13:52:06Z - Ingestion integration test doubles violated strict types
- Area: Ingestion pipeline testing
- What happened: `tsc --noEmit` failed after adding ingestion integration tests because mocked repository/provider dependencies did not satisfy strict interface requirements.
- Impact: Typecheck gate failed and blocked commit readiness.
- Root cause: Test doubles omitted required fields from `DocumentRecord` and `EmbeddingProvider`, and chunk expectation type was narrower than the inserted payload shape.
- Fix implemented: Added strongly typed test factories and full-shape doubles (`DocumentRecord`, `EmbeddingProvider`), then aligned captured chunk call types with production insert payload.
- Prevention/guardrail: For DI-based tests, define helpers that construct full interface-compliant objects instead of ad-hoc partial literals.
- Tests added/updated: `tests/integration/ingestion-pipeline.test.ts`
- Related commit(s): pending

### 2026-02-25T13:56:44Z - Effect route error channel mismatch
- Area: Chat API route orchestration
- What happened: New Effect-based `POST /api/chat` flow returned incorrect errors because sync throws and promise rejections were treated as defects/unknown wrappers.
- Impact: Integration tests for validation, forbidden ownership, and rate limits returned `500` instead of expected `400`/`403`/`429`.
- Root cause: Used `Effect.sync` and bare `Effect.tryPromise` without explicit `catch` mapping, which did not preserve `AppError` instances.
- Fix implemented: Switched to `Effect.try` and `Effect.tryPromise({ try, catch })` with identity catch mapping and added a defect fallback at route boundary.
- Prevention/guardrail: In route-level Effect pipelines, always map thrown/rejected values explicitly to retain typed domain errors.
- Tests added/updated: `tests/integration/chat-api.test.ts`
- Related commit(s): pending

### 2026-02-25T14:02:00Z - Retrieval/orchestrator test double contract mismatch
- Area: Retrieval and orchestration tests
- What happened: `bun run typecheck` failed after replacing skipped tests because mock embedding/LLM providers did not implement all required interface fields.
- Impact: Typecheck gate failed and blocked merge/commit readiness.
- Root cause: Test doubles omitted required `name`/`dimensions` contract fields from `EmbeddingProvider` and `LlmProvider`.
- Fix implemented: Updated test doubles to satisfy full interfaces and kept dependency-injected test seams explicit.
- Prevention/guardrail: Build test doubles from interface contracts, not partial objects, whenever strict TypeScript mode is enabled.
- Tests added/updated: `tests/integration/retrieval.test.ts`, `tests/integration/chat-orchestrator.test.ts`
- Related commit(s): pending

### 2026-02-25T14:08:10Z - Index job API test double shape mismatch
- Area: Indexing API integration tests
- What happened: `bun run typecheck` failed after adding indexing API integration tests.
- Impact: Typecheck failed and blocked commit readiness.
- Root cause: `enqueueCorpusIndexJob` test double returned an object missing required `jobType` and included non-existent fields.
- Fix implemented: Updated the test double to match `IndexJob` exactly.
- Prevention/guardrail: Reuse repository types for job mocks and avoid inferred ad-hoc shapes in strict mode tests.
- Tests added/updated: `tests/integration/indexing-api.test.ts`
- Related commit(s): pending

### 2026-02-25T14:33:25Z - Next production build failed on eager runtime env validation
- Area: Environment/config loading
- What happened: `bun run build` failed during Next page-data collection with `SESSION_SECRET is required in production`.
- Impact: Production build gate failed even though runtime-only secrets should be validated at runtime, not compile/build time.
- Root cause: `lib/env.ts` eagerly parsed and enforced production-only secret requirements at module import, including during `NEXT_PHASE=phase-production-build`.
- Fix implemented: Scoped strict production secret/database enforcement to non-build runtime (`NODE_ENV=production` and not `NEXT_PHASE=phase-production-build`).
- Prevention/guardrail: Keep runtime-only env hard requirements out of build-phase execution paths; explicitly test build-phase env parsing.
- Tests added/updated: `tests/unit/env.test.ts` (added build-phase allowance test), `bun run build`, `bun run check`.
- Related commit(s): pending
