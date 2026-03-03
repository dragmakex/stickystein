import { makeId } from "@/lib/ids"
import { withDb } from "@/db/client"

export type DocumentRecord = {
  readonly id: string
  readonly sourcePath: string
  readonly filename: string
  readonly contentHash: string
  readonly status: "queued" | "indexing" | "ready" | "error"
  readonly pageCount: number | null
  readonly lastIndexedAt: string | null
}

export const upsertDocument = async (input: {
  sourcePath: string
  filename: string
  contentHash: string
  status: DocumentRecord["status"]
}): Promise<DocumentRecord> => {
  return withDb(async (sql) => {
    const id = makeId("doc")
    const [row] = await sql<DocumentRecord[]>`
      INSERT INTO documents (id, source_path, filename, content_hash, status)
      VALUES (${id}, ${input.sourcePath}, ${input.filename}, ${input.contentHash}, ${input.status})
      ON CONFLICT (source_path, content_hash)
      DO UPDATE SET status = EXCLUDED.status, updated_at = now()
      RETURNING id, source_path as "sourcePath", filename, content_hash as "contentHash", status, page_count as "pageCount", last_indexed_at as "lastIndexedAt"
    `
    return row
  })
}

export const getDocumentBySourceAndHash = async (sourcePath: string, contentHash: string): Promise<DocumentRecord | null> => {
  return withDb(async (sql) => {
    const [row] = await sql<DocumentRecord[]>`
      SELECT
        id,
        source_path as "sourcePath",
        filename,
        content_hash as "contentHash",
        status,
        page_count as "pageCount",
        last_indexed_at as "lastIndexedAt"
      FROM documents
      WHERE source_path = ${sourcePath}
        AND content_hash = ${contentHash}
      LIMIT 1
    `
    return row ?? null
  })
}

export const deactivateOtherReadyVersions = async (sourcePath: string, activeDocumentId: string): Promise<void> => {
  await withDb(async (sql) => {
    await sql`
      UPDATE documents
      SET status = 'queued', updated_at = now()
      WHERE source_path = ${sourcePath}
        AND id <> ${activeDocumentId}
        AND status = 'ready'
    `
  })
}

export const markDocumentStatus = async (
  documentId: string,
  status: DocumentRecord["status"],
  opts?: { pageCount?: number; lastIndexedAt?: Date }
): Promise<void> => {
  await withDb(async (sql) => {
    await sql`
      UPDATE documents
      SET status = ${status},
          page_count = COALESCE(${opts?.pageCount ?? null}, page_count),
          last_indexed_at = COALESCE(${opts?.lastIndexedAt?.toISOString() ?? null}, last_indexed_at),
          updated_at = now()
      WHERE id = ${documentId}
    `
  })
}

export const replaceDocumentPages = async (
  documentId: string,
  pages: ReadonlyArray<{ pageNumber: number; text: string; parseWarnings: ReadonlyArray<string> }>
): Promise<void> => {
  await withDb(async (sql) => {
    await sql`DELETE FROM document_pages WHERE document_id = ${documentId}`
    for (const page of pages) {
      await sql`
        INSERT INTO document_pages (id, document_id, page_number, text, char_count, parse_warnings)
        VALUES (${makeId("pg")}, ${documentId}, ${page.pageNumber}, ${page.text}, ${page.text.length}, ${sql.json(page.parseWarnings as never)})
      `
    }
  })
}

export const listDocumentsWithLatestJob = async (): Promise<ReadonlyArray<Record<string, unknown>>> => {
  return withDb(async (sql) => sql`
    SELECT
      d.id as "documentId",
      d.filename,
      d.status,
      d.page_count as "pageCount",
      d.last_indexed_at as "lastIndexedAt",
      j.id as "jobId",
      j.status as "jobStatus",
      j.progress as "jobProgress"
    FROM documents d
    LEFT JOIN LATERAL (
      SELECT id, status, progress
      FROM index_jobs
      WHERE document_id = d.id
      ORDER BY created_at DESC
      LIMIT 1
    ) j ON true
    ORDER BY d.updated_at DESC
  `)
}
