import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { withDb } from "@/db/client"

const migrationsDir = path.join(process.cwd(), "db/migrations")

const ensureTable = async () => {
  await withDb(async (sql) => {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `
  })
}

const status = process.argv.includes("--status")

await ensureTable()

const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()

if (status) {
  const applied = await withDb(async (sql) => sql<{ id: string }[]>`SELECT id FROM schema_migrations ORDER BY id`)
  const appliedSet = new Set(applied.map((row) => row.id))
  for (const file of files) {
    console.log(`${appliedSet.has(file) ? "[x]" : "[ ]"} ${file}`)
  }
  process.exit(0)
}

for (const file of files) {
  const already = await withDb(async (sql) => sql`SELECT 1 FROM schema_migrations WHERE id = ${file} LIMIT 1`)
  if (already.length > 0) continue

  const sqlText = await readFile(path.join(migrationsDir, file), "utf8")
  await withDb(async (sql) => {
    await sql.unsafe(sqlText)
    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`
  })
  console.log(`Applied ${file}`)
}
