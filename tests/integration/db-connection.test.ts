import { readdir } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"

import { expect, test } from "bun:test"

import { withDb } from "@/db/client"

const migrationsDir = path.join(process.cwd(), "db/migrations")
const requiredTables = [
  "documents",
  "document_pages",
  "document_chunks",
  "index_jobs",
  "chat_sessions",
  "chat_threads",
  "chat_messages",
  "rate_limit_buckets",
  "schema_migrations"
]
const requiredIndexes = [
  "idx_documents_status",
  "idx_document_pages_doc_page",
  "idx_document_chunks_doc_page",
  "idx_chat_messages_thread_created",
  "idx_index_jobs_status_scheduled",
  "idx_document_chunks_text_fts",
  "idx_document_chunks_embedding"
]

let migrationsEnsured = false

const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL)

const ensureMigrations = async (): Promise<void> => {
  if (migrationsEnsured) return
  execFileSync(process.execPath, ["run", "scripts/migrate.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe"
  })
  migrationsEnsured = true
}

test("db connection can run a basic query", async () => {
  if (!hasDatabase()) return

  const rows = await withDb(async (sql) => sql<{ value: number }[]>`SELECT 1 AS value`)
  expect(rows[0]?.value).toBe(1)
})

test("migrations are applied and expected schema is available", async () => {
  if (!hasDatabase()) return

  await ensureMigrations()
  const migrationFiles = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()

  const applied = await withDb(async (sql) => sql<{ id: string }[]>`SELECT id FROM schema_migrations ORDER BY id`)
  expect(applied.map((row) => row.id)).toEqual(migrationFiles)

  const extension = await withDb(
    async (sql) => sql<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'vector'`
  )
  expect(extension[0]?.extname).toBe("vector")

  const tables = await withDb(
    async (sql) =>
      sql<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
      `
  )
  const tableSet = new Set(tables.map((row) => row.tablename))
  for (const table of requiredTables) {
    expect(tableSet.has(table)).toBe(true)
  }

  const indexes = await withDb(
    async (sql) =>
      sql<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
      `
  )
  const indexSet = new Set(indexes.map((row) => row.indexname))
  for (const index of requiredIndexes) {
    expect(indexSet.has(index)).toBe(true)
  }
})
