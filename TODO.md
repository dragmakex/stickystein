# TODO.md

Step-by-step execution plan derived from `PROMPT.md`.
Mark each item complete only when code, tests, and review checks are done.

## 0) Foundation
- [x] Confirm Bun-only environment and commands
- [x] Confirm `PROMPT.md` is current source-of-truth
- [x] Confirm/update `AGENT.md`, `TODO.md`, `LEARNINGS.md`
- [x] Confirm `.gitignore` protects env files/secrets and local sensitive artifacts
- [x] Validate repo structure for modular architecture (`app`, `components`, `lib`, `server`, `db`, `scripts`, `tests`)
- [x] Audit existing codebase (architecture, security, test coverage, maintainability)
- [x] Document improvement opportunities and prioritize fixes
- [x] Implement high-priority improvements in existing code before major new features

## 1) Project Setup
- [x] Initialize/verify Next.js + TypeScript app structure
- [x] Configure environment loading and typed config
- [x] Configure lint/typecheck/test scripts using Bun
- [x] Add baseline logging and error handling utilities

## 2) Database + Schema
- [x] Set up PostgreSQL connection layer
- [x] Enable/verify pgvector migration
- [x] Create schema for documents, pages/chunks, embeddings, jobs, sessions, messages
- [x] Add indexes and constraints for retrieval and integrity
- [x] Add integration tests for DB connectivity and migrations

## 3) Ingestion + Indexing Pipeline
- [x] Discover PDFs from `data/`
- [x] Parse PDF text with page metadata
- [x] Normalize and chunk text with deterministic overlap
- [x] Generate/store embeddings in PostgreSQL
- [x] Persist citations metadata (file/page/snippet pointers)
- [x] Add idempotent re-index logic
- [x] Add ingestion/indexing integration tests

## 4) Retrieval + RAG Orchestration
- [x] Implement vector similarity retrieval (top-k)
- [x] Implement optional rerank/context assembly
- [x] Implement answer generation with strict citation grounding
- [x] Enforce no-answer fallback when evidence is insufficient
- [x] Add retrieval quality and citation mapping tests

## 5) API + Session Security
- [x] Build chat API route handlers using EffectTS patterns end-to-end
- [x] Add session/thread/message persistence
- [x] Enforce ownership/authz checks and rate limiting
- [x] Add security headers and EffectTS-based typed/safe error responses
- [x] Add API integration tests for success/failure/security paths

## 6) Frontend (Windows 98 Minimalism + Reuse)
- [x] Implement shared design tokens/components
- [x] Create only two button variants: `PrimaryButton`, `SecondaryButton`
- [x] Build chat interface using shared components only
- [x] Build corpus/indexing status UI using shared components only
- [x] Add citation rendering UX with expandable snippets
- [x] Verify visual consistency across all screens

## 7) Responsive + Accessibility
- [x] Implement responsive layout for desktop/tablet/mobile
- [x] Verify no clipping/overflow/unusable controls at key breakpoints
- [x] Ensure keyboard accessibility and focus states
- [x] Add UI/e2e coverage for responsive behavior

## 8) Security Hardening
- [x] Validate all external input with Effect Schema
- [x] Audit secrets handling and log redaction
- [x] Verify dependency and config safety defaults
- [x] Add tests for security-critical behavior

## 9) Reliability + Observability
- [x] Add job retries for transient errors only
- [x] Add timeout/circuit/fallback patterns where needed
- [x] Add structured logs and actionable error categories
- [x] Ensure partial failures do not break whole app

## 10) Final Validation + Handoff
- [x] Run full lint/typecheck/unit/integration/e2e/build checks
- [x] Review against `PROMPT.md` acceptance criteria
- [x] Update README with setup/run/test + Railway prep notes (no deploy)
- [x] Final production-readiness pass and bug fixes
- [ ] Commit final feature set

## Commit Reminder
- [ ] Commit and push after each completed feature/component with conventional commit messages
- [ ] Always run `git add` first and stage only intended non-sensitive files
- [ ] Verify staged diff contains no env vars, secrets, keys, tokens, credentials, or sensitive data before commit/push
