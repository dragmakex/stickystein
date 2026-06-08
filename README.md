# Stickystein

Next.js + Bun + PostgreSQL/pgvector app for asking questions over indexed PDFs with citations.

## Setup

1. Install dependencies:
   `bun install`
2. Copy envs:
   `cp .env.example .env`
3. For local Ollama indexing, copy the local override:
   `cp .env.local.example .env.local`
4. Run migrations:
   `bun run db:migrate`

## Bun Commands

- `bun run dev`
  Start the app in development mode.
- `bun run build`
  Build the app for production.
- `bun run start`
  Start the built app.
- `bun run worker`
  Start the background worker.
- `bun run db:migrate`
  Apply database migrations.
- `bun run db:migrate:status`
  Show migration status.
- `bun run index:check`
  Verify local Postgres, pgvector, PDF discovery, and Ollama embeddings before indexing.
- `bun run index:corpus`
  Discover PDFs from `PDF_DATA_DIR`, chunk them, embed them, and store them in Postgres.
- `bun run index:local`
  Run the local indexing preflight, migrations, and corpus indexing in sequence.
- `bun run smoke:llm`
  Run a simple LLM smoke test using the current `LLM_*` env vars.
- `bun run test`
  Run all tests.
- `bun run test:unit`
  Run unit tests.
- `bun run test:integration`
  Run integration tests.
- `bun run test:e2e`
  Run render/e2e-style tests.
- `bun run check`
  Run lint, typecheck, and tests.
- `bun run scrape`
  Run the scraping script.

## Notes

- `DATABASE_URL` is required for migrations and runtime DB access.
- `PDF_DATA_DIR` controls which PDF folder `bun run index:corpus` scans.
- `EMBEDDING_*` env vars control indexing and query embedding.
- `LLM_*` env vars control answer generation.
- `.env.local` is the intended place for local Ollama overrides so the base `.env` can stay unchanged.
- The checked-in local override targets `qwen3-embedding:8b` on Ollama with a smaller batch size and longer timeout for local runs.
