import { stat } from "node:fs/promises"

import { withDb } from "@/db/client"
import { env } from "@/lib/env"
import { embeddingProvider } from "@/server/embeddings/client"
import { discoverLocalPdfs } from "@/server/ingestion/discover"

const fail = (message: string): never => {
  console.error(`\n[index:check] ${message}\n`)
  process.exit(1)
}

const checkPdfDirectory = async (): Promise<number> => {
  try {
    const fileStat = await stat(env.pdfDataDir)
    if (!fileStat.isDirectory()) {
      fail(`PDF_DATA_DIR is not a directory: ${env.pdfDataDir}`)
    }
  } catch (error) {
    fail(
      `PDF_DATA_DIR does not exist: ${env.pdfDataDir}${
        error instanceof Error && error.message ? ` (${error.message})` : ""
      }`
    )
  }

  const discovered = await discoverLocalPdfs(env.pdfDataDir)
  if (discovered.length === 0) {
    fail(`No PDFs found under ${env.pdfDataDir}`)
  }

  return discovered.length
}

const checkDatabase = async (): Promise<{ database: string; hasVector: boolean }> => {
  return withDb(async (sql) => {
    const [databaseRow] = await sql<{ currentDatabase: string }[]>`SELECT current_database() as "currentDatabase"`
    const [vectorRow] = await sql<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'vector'`

    return {
      database: databaseRow?.currentDatabase ?? "unknown",
      hasVector: vectorRow?.extname === "vector"
    }
  })
}

const checkEmbeddings = async (): Promise<number> => {
  const provider = embeddingProvider()
  const [vector] = await provider.embedTexts(["healthcheck"])
  if (!vector || vector.length === 0) {
    fail("Embedding provider returned an empty vector")
  }
  return vector.length
}

const pdfCount = await checkPdfDirectory()
console.log(`[index:check] PDF discovery ok (${pdfCount} PDFs)`)

if (!env.databaseUrl) {
  fail("DATABASE_URL is empty")
}

console.log("[index:check] Checking database connectivity")
const database = await (async () => {
  try {
    return await checkDatabase()
  } catch (error) {
    return fail(`Database connection failed${error instanceof Error ? `: ${error.message}` : ""}`)
  }
})()

if (!database.hasVector) {
  fail("pgvector extension is not installed in the configured database. Run `bun run db:migrate` first.")
}

console.log(`[index:check] Database ok (${database.database})`)
console.log("[index:check] Checking Ollama embeddings")
const embeddingLength = await (async () => {
  try {
    return await checkEmbeddings()
  } catch (error) {
    return fail(
      `Embedding provider check failed${error instanceof Error ? `: ${error.message}` : ""}. ` +
        "Ensure Ollama is running and the embedding model is available locally."
    )
  }
})()

console.log("[index:check] Ready")
console.log(`[index:check] Database: ${database.database}`)
console.log(`[index:check] PDF_DATA_DIR: ${env.pdfDataDir}`)
console.log(`[index:check] PDFs discovered: ${pdfCount}`)
console.log(`[index:check] Embedding provider: ${env.embeddings.provider}`)
console.log(`[index:check] Embedding model: ${env.embeddings.model}`)
console.log(`[index:check] Embedding dimensions: ${embeddingLength}`)
console.log("\nNext steps:")
console.log("1. bun run db:migrate")
console.log("2. bun run index:corpus")
