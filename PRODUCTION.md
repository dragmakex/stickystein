# Production Runbook (Railway)

This is the exact checklist to take this repo live in production.

## 1) Pre-flight (local)

- [ ] Confirm code is ready:
  - `bun run check`
  - `bun run build`
- [ ] Confirm you have accounts/access:
  - Railway project admin access
  - LLM provider account (Zhipu/GLM)
  - Embedding provider account (if not using `mock`)

## 2) Create Railway services

- [ ] In one Railway project, create:
  - `postgres` service
  - `web` service (this repo)
  - `worker` service (same repo)
- [ ] Attach the `postgres` service to both `web` and `worker` so `DATABASE_URL` is available.

## 3) Configure build/start commands

### Web service

- [ ] Build command: `bun run build`
- [ ] Start command: `bun run start`
- [ ] Health check path: `/api/health`

### Worker service

- [ ] Build command: `bun run build`
- [ ] Start command: `bun run worker`

## 4) Set production environment variables

Set these in Railway Variables. Prefer project-level shared vars, then override per-service only if needed.

### Required for production runtime

| Variable | Value to set | Where to get it |
| --- | --- | --- |
| `NODE_ENV` | `production` | Static value |
| `APP_BASE_URL` | `https://<your-domain>` | Your final prod domain (Railway domain or custom domain) |
| `SESSION_SECRET` | 64+ hex chars | Generate: `openssl rand -hex 32` |
| `DATABASE_URL` | Postgres connection URL | Railway Postgres service variable (`DATABASE_URL`) |

### Required for live LLM responses

| Variable | Value to set | Where to get it |
| --- | --- | --- |
| `LLM_PROVIDER` | `glm-zhipu` | Static value (current app provider) |
| `GLM_API_KEY` | Your GLM API key | Zhipu BigModel console -> API keys |
| `LLM_BASE_URL` | Provider REST base URL | Zhipu BigModel API docs for your plan |
| `LLM_MODEL` | Model ID string | Zhipu BigModel model list/docs |

### Embeddings (required for useful retrieval quality)

| Variable | Value to set | Where to get it |
| --- | --- | --- |
| `EMBEDDING_PROVIDER` | `openai-compatible` (recommended) or `mock` | Choose based on provider |
| `EMBEDDING_API_KEY` | Embedding API key | Your embedding provider console |
| `EMBEDDING_BASE_URL` | Embedding API base URL | Your embedding provider docs |
| `EMBEDDING_MODEL` | Embedding model ID | Your embedding provider model docs |
| `EMBEDDING_DIMENSIONS` | `128` | Must stay `128` with current DB migration (`vector(128)`) |

### Required for secured indexing endpoints

| Variable | Value to set | Where to get it |
| --- | --- | --- |
| `ADMIN_INGEST_TOKEN` | Random secret token | Generate: `openssl rand -hex 32` |

### Recommended operational defaults (set explicitly)

- [ ] `LOG_LEVEL=info`
- [ ] `LLM_TIMEOUT_MS=30000`
- [ ] `LLM_MAX_OUTPUT_TOKENS=1024`
- [ ] `LLM_TEMPERATURE=0.1`
- [ ] `RAG_CHUNK_SIZE=1200`
- [ ] `RAG_CHUNK_OVERLAP=150`
- [ ] `RAG_TOP_K_VECTOR=20`
- [ ] `RAG_TOP_K_LEXICAL=20`
- [ ] `RAG_TOP_K_FINAL=8`
- [ ] `RAG_MAX_CONTEXT_CHARS=24000`
- [ ] `RATE_LIMIT_CHAT_WINDOW_SEC=60`
- [ ] `RATE_LIMIT_CHAT_MAX=10`
- [ ] `RATE_LIMIT_THREADS_WINDOW_SEC=60`
- [ ] `RATE_LIMIT_THREADS_MAX=20`
- [ ] `RATE_LIMIT_INDEX_WINDOW_SEC=60`
- [ ] `RATE_LIMIT_INDEX_MAX=3`
- [ ] `JOB_WORKER_POLL_MS=1000`
- [ ] `JOB_WORKER_CONCURRENCY=1`
- [ ] `JOB_MAX_ATTEMPTS=5`
- [ ] `JOB_RETRY_BASE_MS=5000`
- [ ] `JOB_RETRY_MAX_MS=60000`

## 5) Data/corpus availability

- [ ] Ensure `data/` PDFs are available at runtime to both services.
  - This app discovers files from local `data/` path recursively.
  - Use a mounted volume/synced files strategy in prod. Do not assume local dev files exist in container runtime.

## 6) Deploy + migrate

- [ ] Trigger deploy for `web` and `worker`.
- [ ] Run DB migrations once against production DB:
  - `bun run db:migrate`
- [ ] Verify migration status:
  - `bun run db:migrate:status`
- [ ] Confirm `0002_pgvector.sql` applied (requires `vector` extension).

## 7) Smoke checks after deploy

- [ ] Health endpoint returns 200:
  - `GET https://<your-domain>/api/health`
- [ ] Start indexing job:
  - `POST /api/index/run` with header `x-admin-token: <ADMIN_INGEST_TOKEN>`
- [ ] Track indexing status:
  - `GET /api/index/documents`
- [ ] Run a chat query and confirm grounded citation output.

## 8) Go-live gate

Ship only after all are true:

- [ ] Web and worker are both running continuously.
- [ ] Health checks stable for 15+ minutes.
- [ ] At least one full corpus indexing run succeeded.
- [ ] Chat answers return citations for corpus-backed questions.
- [ ] No startup errors about `SESSION_SECRET` or `DATABASE_URL`.
- [ ] No embedding dimension mismatch errors.

## 9) Known production gotchas

- `SESSION_SECRET` must be at least 32 characters in production.
- `DATABASE_URL` must exist in production.
- `EMBEDDING_DIMENSIONS` must match DB vector type (`128` right now).
- If `ADMIN_INGEST_TOKEN` is missing, index admin endpoints will reject requests.
