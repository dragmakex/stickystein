# AGENT.md

## Purpose
Execute `PROMPT.md` as the canonical spec and deliver a production-ready app without skipping security, architecture, testing, or review discipline.

## Source of Truth
- `PROMPT.md` is authoritative.
- If any file conflicts with `PROMPT.md`, follow `PROMPT.md` and update the other file.

## Operating Rules
- Use Bun only (`bun`, `bun run`, `bun test`, `bun install`).
- Review existing code before adding new features; improve existing modules when gaps are found.
- Keep architecture modular: app routes, reusable UI components, server services, db layer, scripts, tests.
- Use EffectTS for all backend API logic, service orchestration, validation integration, and typed error handling.
- Never commit sensitive data (env vars/files, API keys, tokens, credentials, secrets, private corpus data).
- Keep a dedicated `scripts/` folder for automation and operational tasks.
- Build secure-by-default behavior (validation, authz, rate limits, headers, safe logging, secret hygiene).
- Maintain responsive behavior across desktop/tablet/mobile.
- Use minimalist Windows 98-inspired frontend styling.
- Reuse component primitives throughout frontend.
- Use exactly two button styles/variants across the app: primary and secondary.

## Required Companion Files
- `TODO.md`: step-by-step execution checklist; update status continuously.
- `LEARNINGS.md`: append entries whenever something fails or behaves unexpectedly.

## Failure Logging Protocol (Mandatory)
When something goes wrong, append to `LEARNINGS.md` with:
1. Date/time (UTC)
2. What failed
3. Impact
4. Root cause
5. Fix implemented
6. Prevention/guardrail added
7. Related commit(s)

## Development Workflow (Per Feature)
1. Review relevant existing code and identify improvements.
2. Implement the feature in modular code.
3. Add/adjust tests (unit/integration/e2e as relevant).
4. Run checks: lint, typecheck, tests, build readiness.
5. Review for security, reliability, and maintainability.
6. Stage only intended files with `git add` (never stage secrets/sensitive files).
7. Commit to git with a clear conventional message.
8. Push the commit to remote immediately.

## Commit Discipline
- Commit and push after every completed feature, including creation of any new component.
- Use `git add` before each commit and stage only safe, intended files.
- Before commit/push, inspect staged diff and verify no env vars/secrets/sensitive data are included.
- Conventional commit style: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`.
- Each feature commit must include code + tests + docs updates (if applicable).
