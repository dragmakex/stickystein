import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"

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
  readonly hashDocument: (doc: InputDocument) => Promise<string>
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

const hashDocument = async (doc: InputDocument): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(doc.path)

    stream.on("data", (chunk) => {
      hash.update(chunk)
    })
    stream.on("error", reject)
    stream.on("end", () => {
      resolve(hash.digest("hex"))
    })
  })

const defaultDeps: IndexDocumentDeps = {
  hashDocument,
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

const isZeroVector = (vector: ReadonlyArray<number> | undefined): boolean =>
  Array.isArray(vector) && vector.length > 0 && vector.every((value) => value === 0)

const previewChunkText = (text: string, maxLength = 200): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

const zeroVectorMetadata = (doc: InputDocument, chunk: { pageNumber: number | null; chunkIndex: number; text: string }) => ({
  embeddingFallback: "zero-vector",
  embeddingFallbackAt: new Date().toISOString(),
  embeddingFallbackFilename: doc.filename,
  embeddingFallbackPageNumber: chunk.pageNumber,
  embeddingFallbackChunkIndex: chunk.chunkIndex,
  embeddingFallbackPreview: previewChunkText(chunk.text)
})

export const indexDocument = async (doc: InputDocument, deps: IndexDocumentDeps = defaultDeps): Promise<void> => {
  const contentHash = await deps.hashDocument(doc)
  const existing = await deps.getDocumentBySourceAndHash(doc.filename, contentHash)
  if (existing?.status === "ready") {
    return
  }

  const stored = await deps.upsertDocument({
    sourcePath: doc.filename,
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
      for (const [index, chunk] of chunks.entries()) {
        const vector = vectors[index]
        if (isZeroVector(vector)) {
          console.warn("Embedding fallback to zero vector", {
            filename: doc.filename,
            pageNumber: chunk.pageNumber,
            chunkIndex: chunk.chunkIndex,
            preview: previewChunkText(chunk.text)
          })
        }
      }
      await deps.persistEmbeddings(
        chunks.map((chunk, index) => ({
          chunkId: chunk.id,
          embedding: vectors[index],
          metadata: isZeroVector(vectors[index]) ? zeroVectorMetadata(doc, chunk) : undefined
        }))
      )
    }

    await deps.markDocumentStatus(stored.id, "ready", { pageCount: parsed.pageCount, lastIndexedAt: new Date() })
    await deps.deactivateOtherReadyVersions(doc.filename, stored.id)
  } catch (error) {
    await deps.markDocumentStatus(stored.id, "error")
    throw error
  }
}
