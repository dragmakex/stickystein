# Railway Deployment Prep (No Deployment Executed)

## Services

- Web service
- Worker service
- PostgreSQL service with `pgvector` extension enabled

## Build/Start

- Build: `bun run build`
- Web start: `bun run start`
- Worker start: `bun run worker`

## Required env vars

Use values from `.env.example` and set Railway `DATABASE_URL`.

## Migrations

Run: `bun run db:migrate`

## Health check

- `GET /api/health`

## Notes

- Verify GLM endpoint/model values per plan.
- Production corpus packaging for `data/` may require a volume or bundled assets.
