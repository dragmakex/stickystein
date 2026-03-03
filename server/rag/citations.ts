import { sanitizeFilename, sanitizeText } from "@/lib/security/sanitize"
import type { RetrievedChunk } from "@/server/repositories/chunks-repo"

export type Citation = {
  readonly documentId: string
  readonly filename: string
  readonly pageNumber: number | null
  readonly chunkId: string
  readonly snippet: string
}

export const toCitation = (chunk: RetrievedChunk): Citation => ({
  documentId: chunk.documentId,
  filename: sanitizeFilename(chunk.filename),
  pageNumber: chunk.pageNumber,
  chunkId: chunk.chunkId,
  snippet: sanitizeText(chunk.snippet)
})
