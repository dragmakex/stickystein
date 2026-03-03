import { createHash } from "node:crypto"

import { chunkDocumentPages } from "@/server/rag/chunking"
import { embeddingProvider } from "@/server/embeddings/client"
import {
  deactivateOtherReadyVersions,
  getDocumentBySourceAndHash,
  markDocumentStatus,
  replaceDocumentPages,
  upsertDocument
} from "@/server/repositories/documents-repo"
import { deleteChunksForDocument, insertChunks, persistEmbeddings } from "@/server/repositories/chunks-repo"
import { parsePdfByPage } from "@/server/ingestion/parse-pdf"

type InputDocument = {
  readonly path: string
  readonly filename: string
  readonly mtimeMs: number
  readonly size: number
}

type IndexDocumentDeps = {
  readonly getDocumentBySourceAndHash: typeof getDocumentBySourceAndHash
  readonly upsertDocument: typeof upsertDocument
  readonly deleteChunksForDocument: typeof deleteChunksForDocument
  readonly parsePdfByPage: typeof parsePdfByPage
  readonly replaceDocumentPages: typeof replaceDocumentPages
  readonly chunkDocumentPages: typeof chunkDocumentPages
  readonly insertChunks: typeof insertChunks
  readonly embeddingProvider: typeof embeddingProvider
  readonly persistEmbeddings: typeof persistEmbeddings
  readonly markDocumentStatus: typeof markDocumentStatus
  readonly deactivateOtherReadyVersions: typeof deactivateOtherReadyVersions
}

const hashDocument = (doc: InputDocument): string => createHash("sha256").update(`${doc.path}:${doc.size}:${doc.mtimeMs}`).digest("hex")

const defaultDeps: IndexDocumentDeps = {
  getDocumentBySourceAndHash,
  upsertDocument,
  deleteChunksForDocument,
  parsePdfByPage,
  replaceDocumentPages,
  chunkDocumentPages,
  insertChunks,
  embeddingProvider,
  persistEmbeddings,
  markDocumentStatus,
  deactivateOtherReadyVersions
}

export const indexDocument = async (doc: InputDocument, deps: IndexDocumentDeps = defaultDeps): Promise<void> => {
  const contentHash = hashDocument(doc)
  const existing = await deps.getDocumentBySourceAndHash(doc.path, contentHash)
  if (existing?.status === "ready") {
    return
  }

  const stored = await deps.upsertDocument({
    sourcePath: doc.path,
    filename: doc.filename,
    contentHash,
    status: "indexing"
  })

  try {
    await deps.deleteChunksForDocument(stored.id)

    const parsed = await deps.parsePdfByPage(doc.path)
    await deps.replaceDocumentPages(
      stored.id,
      parsed.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        parseWarnings: page.warnings
      }))
    )

    const chunks = deps.chunkDocumentPages(
      parsed.pages.map((page) => ({ documentId: stored.id, pageNumber: page.pageNumber, text: page.text }))
    )

    await deps.insertChunks(
      chunks.map((chunk) => ({
        id: chunk.id,
        documentId: chunk.documentId,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        snippet: chunk.snippet,
        tokenEstimate: chunk.tokenEstimate,
        metadata: { source: "pdf", parseWarnings: parsed.pages[chunk.pageNumber - 1]?.warnings ?? [] }
      }))
    )

    if (chunks.length > 0) {
      const embedder = deps.embeddingProvider()
      const vectors = await embedder.embedTexts(chunks.map((chunk) => chunk.text))
      await deps.persistEmbeddings(chunks.map((chunk, index) => ({ chunkId: chunk.id, embedding: vectors[index] })))
    }

    await deps.markDocumentStatus(stored.id, "ready", { pageCount: parsed.pageCount, lastIndexedAt: new Date() })
    await deps.deactivateOtherReadyVersions(doc.path, stored.id)
  } catch (error) {
    await deps.markDocumentStatus(stored.id, "error")
    throw error
  }
}
