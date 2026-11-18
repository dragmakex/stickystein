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
  Verify local Postgres, pgvector, PDF discovery, and the configured embedding provider before indexing.
- `bun run index:status`
  Show ready, indexing, and error counts for datasets 9 and 10.
- `bun run index:compat`
  Compare a few stored vectors with fresh configured embeddings.
- `bun run index:compare`
  Compare the configured remote embeddings with local Ollama for the same text.
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

## This VPS

The app is intentionally open: there is no sign-in, magic-link, or OAuth flow. Every request acts as the public user.

The `e-files-web.service` process reads `.env`. Both `LLM_*` and `EMBEDDING_*` use the SwissAI LB at `http://127.0.0.1:2456/v1`. Chat uses a Qwen3 model from that catalog; query embeddings use `RCP-AIaaS/Qwen/Qwen3-Embedding-8B` at 128 dimensions. The direct Bun indexing scripts load `.env.local`, which uses the same SwissAI LB and embedding model for PDFs. Nginx forwards web requests to the app; it does not generate embeddings.

Run `bun run index:compat` if the embedding model or provider changes. It compares a few stored chunks with fresh embeddings and reports cosine similarity; it does not change stored vectors. The corpus indexer skips documents already marked ready.

Embeddings are intentionally mixed. Chunks written before the SwissAI cutover remain in the legacy provider's 128-dimensional space; new chunks use SwissAI's 128-dimensional space. Both live in the same `document_chunks.embedding` column and are queried with SwissAI embeddings. The two providers' vectors are close enough (cosine around 0.988–0.992 on sampled chunks) that the corpus does not need a full re-embed to keep using older chunks.

### Background Indexing

The PM2 app in `ecosystem.config.cjs` runs DataSet 9 followed by DataSet 10 with SwissAI LB embeddings and writes progress to PM2 logs. Install PM2 with `bun add -g pm2`, then start it with `pm2 start ecosystem.config.cjs`.

Check it with `pm2 status`, `pm2 logs stickystein-index`, or `bun run index:status`. Stop it with `pm2 stop stickystein-index`; use `pm2 restart stickystein-index` to resume after a failure. The indexer skips documents already marked ready. PM2 runs after you close SSH.

On this VPS, the user crontab has an `@reboot` hook (`~/bin/stickystein-pm2-resurrect.sh`) that waits for Postgres, then restores `~/.pm2/dump.pm2`. The PM2 app is configured to restart on crashes and to stop on a clean exit code 0, so a completed corpus run does not loop.
