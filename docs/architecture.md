# Architecture

- Web: Next.js App Router routes and chat UI.
- Worker: Postgres-backed indexing job loop.
- DB: documents/pages/chunks/jobs/sessions/messages/rate-limits.
- RAG: hybrid retrieval (vector + lexical), context capping, citations.
- Providers: pluggable LLM and embedding adapters.
