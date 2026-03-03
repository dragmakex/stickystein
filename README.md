# E-Files Secure RAG Chat

Next.js + Bun + PostgreSQL/pgvector + Effect app for retrieval-grounded chat over local PDFs in `data/`.

## Setup

1. Install dependencies: `bun install`
2. Copy envs: `cp .env.example .env`
3. Run migrations: `bun run db:migrate`
4. Start app: `bun run dev`
5. Start worker: `bun run worker`

## Commands

- `bun run index:corpus` indexes local PDFs
- `bun run smoke:glm` runs manual GLM smoke test
- `bun run test` executes tests
- `bun run check` runs lint/typecheck/tests
- `bun run build` performs production build validation

## Notes

- `LLM_BASE_URL` and `LLM_MODEL` are provider-plan specific; keep them environment-driven.
- App uses retrieval citations and refuses fabricated evidence by system prompt policy.
- In production runtime, `SESSION_SECRET` (>= 32 chars) and `DATABASE_URL` are required.

## Railway Prep (No Deployment Executed)

Services:
- Web service
- Worker service
- PostgreSQL service with `pgvector` enabled

Build/start commands:
- Build: `bun run build`
- Web start: `bun run start`
- Worker start: `bun run worker`

Operational steps:
- Set environment values from `.env.example` plus Railway `DATABASE_URL`
- Run migrations: `bun run db:migrate`
- Health check endpoint: `GET /api/health`
- Ensure `data/` corpus is available to runtime (bundled or mounted volume)
