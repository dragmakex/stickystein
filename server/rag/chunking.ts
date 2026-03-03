import { env } from "@/lib/env"
import { makeId } from "@/lib/ids"

export type ChunkInput = {
  readonly documentId: string
  readonly pageNumber: number
  readonly text: string
}

export type Chunk = {
  readonly id: string
  readonly documentId: string
  readonly pageNumber: number
  readonly chunkIndex: number
  readonly text: string
  readonly snippet: string
  readonly tokenEstimate: number
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

const makeSnippet = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= 220) return normalized
  return `${normalized.slice(0, 220)}...`
}

export const chunkDocumentPages = (
  pages: ReadonlyArray<ChunkInput>,
  chunkSize = env.rag.chunkSize,
  overlap = env.rag.chunkOverlap
): ReadonlyArray<Chunk> => {
  const chunks: Chunk[] = []
  let chunkIndex = 0

  for (const page of pages) {
    const text = page.text.trim()
    if (!text) continue
    let cursor = 0

    while (cursor < text.length) {
      const end = Math.min(cursor + chunkSize, text.length)
      const chunkText = text.slice(cursor, end)
      chunks.push({
        id: makeId("chk"),
        documentId: page.documentId,
        pageNumber: page.pageNumber,
        chunkIndex,
        text: chunkText,
        snippet: makeSnippet(chunkText),
        tokenEstimate: estimateTokens(chunkText)
      })
      chunkIndex += 1
      if (end >= text.length) break
      cursor = Math.max(end - overlap, cursor + 1)
    }
  }

  return chunks
}
