import { withDb } from "@/db/client"

export type RetrievedChunk = {
  readonly chunkId: string
  readonly documentId: string
  readonly filename: string
  readonly pageNumber: number | null
  readonly text: string
  readonly snippet: string
  readonly score: number
}

export const insertChunks = async (chunks: ReadonlyArray<{
  id: string
  documentId: string
  pageNumber: number | null
  chunkIndex: number
  text: string
  snippet: string
  tokenEstimate: number
  metadata: unknown
}>): Promise<void> => {
  if (chunks.length === 0) return
  await withDb(async (sql) => {
    for (const chunk of chunks) {
      await sql`
        INSERT INTO document_chunks (id, document_id, page_number, chunk_index, text, snippet, token_estimate, metadata)
        VALUES (${chunk.id}, ${chunk.documentId}, ${chunk.pageNumber}, ${chunk.chunkIndex}, ${chunk.text}, ${chunk.snippet}, ${chunk.tokenEstimate}, ${sql.json(chunk.metadata as never)})
        ON CONFLICT (document_id, chunk_index) DO UPDATE
        SET text = EXCLUDED.text,
            snippet = EXCLUDED.snippet,
            token_estimate = EXCLUDED.token_estimate,
            metadata = EXCLUDED.metadata
      `
    }
  })
}

export const deleteChunksForDocument = async (documentId: string): Promise<void> => {
  await withDb(async (sql) => {
    await sql`DELETE FROM document_chunks WHERE document_id = ${documentId}`
  })
}

export const lexicalSearch = async (query: string, limit: number): Promise<ReadonlyArray<RetrievedChunk>> => {
  return withDb(async (sql) => sql<RetrievedChunk[]>`
    SELECT
      c.id as "chunkId",
      c.document_id as "documentId",
      d.filename,
      c.page_number as "pageNumber",
      c.text,
      c.snippet,
      ts_rank_cd(to_tsvector('english', c.text), plainto_tsquery('english', ${query})) as score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND NOT EXISTS (
        SELECT 1
        FROM documents newer
        WHERE newer.source_path = d.source_path
          AND newer.status = 'ready'
          AND newer.id <> d.id
          AND COALESCE(newer.last_indexed_at, newer.created_at) > COALESCE(d.last_indexed_at, d.created_at)
      )
      AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${query})
    ORDER BY score DESC
    LIMIT ${limit}
  `)
}

export const vectorSearch = async (embedding: ReadonlyArray<number>, limit: number): Promise<ReadonlyArray<RetrievedChunk>> => {
  const vector = `[${embedding.join(",")}]`
  return withDb(async (sql) => sql<RetrievedChunk[]>`
    SELECT
      c.id as "chunkId",
      c.document_id as "documentId",
      d.filename,
      c.page_number as "pageNumber",
      c.text,
      c.snippet,
      1 - (c.embedding <=> ${vector}::vector) as score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND NOT EXISTS (
        SELECT 1
        FROM documents newer
        WHERE newer.source_path = d.source_path
          AND newer.status = 'ready'
          AND newer.id <> d.id
          AND COALESCE(newer.last_indexed_at, newer.created_at) > COALESCE(d.last_indexed_at, d.created_at)
      )
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `)
}

export const persistEmbeddings = async (rows: ReadonlyArray<{
  chunkId: string
  embedding: ReadonlyArray<number>
  metadata?: Record<string, unknown>
}>): Promise<void> => {
  await withDb(async (sql) => {
    for (const row of rows) {
      const vector = `[${row.embedding.join(",")}]`
      if (row.metadata) {
        await sql`
          UPDATE document_chunks
          SET embedding = ${vector}::vector,
              metadata = COALESCE(metadata, '{}'::jsonb) || ${sql.json(row.metadata as never)}::jsonb
          WHERE id = ${row.chunkId}
        `
        continue
      }

      await sql`UPDATE document_chunks SET embedding = ${vector}::vector WHERE id = ${row.chunkId}`
    }
  })
}
