# Project Brief and Navigation

This repository builds a secure, production-ready web app to chat with the local Epstein PDF corpus in `data/`.

## What We Are Building
- Next.js + TypeScript web app (Bun-only runtime/workflow)
- PostgreSQL + pgvector-backed RAG pipeline
- EffectTS-first backend APIs, validation, orchestration, and error handling
- Minimalist Windows 98-inspired responsive UI using reusable modular components
- Strict security, testing, and operational discipline

## Canonical Specification
- `SPEC.md` is the full source-of-truth specification and execution plan.
- All implementation decisions, acceptance criteria, architecture, testing, security, git workflow, and deployment-prep rules live in `SPEC.md`.

## Where Agents Must Look
- `SPEC.md`: full technical specification and required implementation sequence
- `AGENT.md`: agent operating rules and workflow expectations
- `TODO.md`: step-by-step development checklist derived from the spec
- `LEARNINGS.md`: append-only log of failures, root causes, fixes, and guardrails
- `.env.example`: required env variables (placeholders only)
- `Dockerfile` + `.dockerignore`: container build/run setup for easy deployment prep

## Workflow Requirements (Non-Negotiable)
- Review existing code first, then improve it before/alongside new work
- Use Bun commands only
- Use EffectTS for all backend API and error-handling flows
- After every implemented feature or new component: `git add` -> `git commit` -> `git push`
- Never commit env vars, secrets, keys, tokens, credentials, private documents, or sensitive data
- Verify staged diff before each commit/push

## Deployment Note
Deployment target is Railway, but deployment is not executed in this repository workflow. Prepare and document deployment only.
