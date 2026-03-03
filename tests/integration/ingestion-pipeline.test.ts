import { expect, test } from "bun:test"

import { indexDocument } from "@/server/ingestion/index-document"
import type { Chunk } from "@/server/rag/chunking"
import type { DocumentRecord } from "@/server/repositories/documents-repo"

const makeDocumentRecord = (overrides: Partial<DocumentRecord>): DocumentRecord => ({
  id: overrides.id ?? "doc_default",
  sourcePath: overrides.sourcePath ?? "/tmp/default.pdf",
  filename: overrides.filename ?? "default.pdf",
  contentHash: overrides.contentHash ?? "content_hash",
  status: overrides.status ?? "indexing",
  pageCount: overrides.pageCount ?? null,
  lastIndexedAt: overrides.lastIndexedAt ?? null
})

test("indexDocument returns early when ready version already exists", async () => {
  let upsertCalled = false

  await indexDocument(
    { path: "/tmp/existing.pdf", filename: "existing.pdf", mtimeMs: 100, size: 10 },
    {
      getDocumentBySourceAndHash: async () => makeDocumentRecord({ id: "doc_existing", status: "ready" }),
      upsertDocument: async (input) => {
        upsertCalled = true
        return makeDocumentRecord({ id: "doc_existing", ...input })
      },
      deleteChunksForDocument: async () => {},
      parsePdfByPage: async () => ({ pageCount: 0, pages: [] }),
      replaceDocumentPages: async () => {},
      chunkDocumentPages: () => [],
      insertChunks: async () => {},
      embeddingProvider: () => ({ name: "test", dimensions: 3, embedTexts: async () => [] }),
      persistEmbeddings: async () => {},
      markDocumentStatus: async () => {},
      deactivateOtherReadyVersions: async () => {}
    }
  )

  expect(upsertCalled).toBe(false)
})

test("indexDocument stores page metadata, chunks, and embeddings", async () => {
  const statusCalls: Array<{ status: string; pageCount?: number }> = []
  const replacePagesCalls: Array<ReadonlyArray<{ pageNumber: number; text: string; parseWarnings: ReadonlyArray<string> }>> = []
  const insertChunksCalls: Array<
    ReadonlyArray<{
      id: string
      documentId: string
      pageNumber: number | null
      chunkIndex: number
      metadata: unknown
      text: string
      snippet: string
      tokenEstimate: number
    }>
  > = []
  const persistEmbeddingCalls: Array<ReadonlyArray<{ chunkId: string; embedding: ReadonlyArray<number> }>> = []
  const embedTextsCalls: string[][] = []
  let deactivateCalled = false

  const fakeChunks: ReadonlyArray<Chunk> = [
    {
      id: "chk_1",
      documentId: "doc_1",
      pageNumber: 1,
      chunkIndex: 0,
      text: "Page one content",
      snippet: "Page one content",
      tokenEstimate: 4
    },
    {
      id: "chk_2",
      documentId: "doc_1",
      pageNumber: 2,
      chunkIndex: 1,
      text: "Page two content",
      snippet: "Page two content",
      tokenEstimate: 4
    }
  ]

  await indexDocument(
    { path: "/tmp/new.pdf", filename: "new.pdf", mtimeMs: 200, size: 20 },
    {
      getDocumentBySourceAndHash: async () => null,
      upsertDocument: async (input) => makeDocumentRecord({ id: "doc_1", ...input }),
      deleteChunksForDocument: async () => {},
      parsePdfByPage: async () => ({
        pageCount: 2,
        pages: [
          { pageNumber: 1, text: "Page one content", warnings: [] },
          { pageNumber: 2, text: "Page two content", warnings: ["empty-page"] }
        ]
      }),
      replaceDocumentPages: async (_documentId, pages) => {
        replacePagesCalls.push(pages)
      },
      chunkDocumentPages: () => fakeChunks,
      insertChunks: async (chunks) => {
        insertChunksCalls.push(chunks)
      },
      embeddingProvider: () => ({
        name: "test",
        dimensions: 3,
        embedTexts: async (texts: string[]) => {
          embedTextsCalls.push(texts)
          return [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6]
          ]
        }
      }),
      persistEmbeddings: async (rows) => {
        persistEmbeddingCalls.push(rows)
      },
      markDocumentStatus: async (_documentId, status, options) => {
        statusCalls.push({ status, pageCount: options?.pageCount })
      },
      deactivateOtherReadyVersions: async () => {
        deactivateCalled = true
      }
    }
  )

  expect(replacePagesCalls).toHaveLength(1)
  expect(replacePagesCalls[0]).toEqual([
    { pageNumber: 1, text: "Page one content", parseWarnings: [] },
    { pageNumber: 2, text: "Page two content", parseWarnings: ["empty-page"] }
  ])

  expect(insertChunksCalls).toHaveLength(1)
  expect(insertChunksCalls[0]).toEqual([
    {
      id: "chk_1",
      documentId: "doc_1",
      pageNumber: 1,
      chunkIndex: 0,
      text: "Page one content",
      snippet: "Page one content",
      tokenEstimate: 4,
      metadata: { source: "pdf", parseWarnings: [] }
    },
    {
      id: "chk_2",
      documentId: "doc_1",
      pageNumber: 2,
      chunkIndex: 1,
      text: "Page two content",
      snippet: "Page two content",
      tokenEstimate: 4,
      metadata: { source: "pdf", parseWarnings: ["empty-page"] }
    }
  ])

  expect(embedTextsCalls).toEqual([["Page one content", "Page two content"]])
  expect(persistEmbeddingCalls).toEqual([
    [
      { chunkId: "chk_1", embedding: [0.1, 0.2, 0.3] },
      { chunkId: "chk_2", embedding: [0.4, 0.5, 0.6] }
    ]
  ])

  expect(statusCalls).toEqual([{ status: "ready", pageCount: 2 }])
  expect(deactivateCalled).toBe(true)
})
