# Operations

- Enqueue indexing: `POST /api/index/run` with `x-admin-token`
- Retry failed job: `POST /api/index/retry/:jobId` with `x-admin-token`
- List status: `GET /api/index/documents`
- Manual corpus index: `bun run index:corpus`
