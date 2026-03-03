import { expect, test } from "bun:test"

import { createHybridRetrieve } from "@/server/rag/retrieval"
import type { RetrievedChunk } from "@/server/repositories/chunks-repo"

const chunk = (chunkId: string, score: number): RetrievedChunk => ({
  chunkId,
  documentId: "doc_1",
  filename: "evidence.pdf",
  pageNumber: 1,
  text: `${chunkId}-text`,
  snippet: `${chunkId}-snippet`,
  score
})

test("hybrid retrieval embeds query, merges vector+lexical, dedupes, and limits", async () => {
  const calls: { vector?: { embedding: ReadonlyArray<number>; limit: number }; lexical?: { query: string; limit: number } } = {}

  const run = createHybridRetrieve({
    embeddingProvider: () => ({
      name: "test-embedding",
      dimensions: 2,
      embedTexts: async (texts) => {
        expect(texts).toEqual(["who met whom"])
        return [[0.11, 0.22]]
      }
    }),
    vectorSearch: async (embedding, limit) => {
      calls.vector = { embedding, limit }
      return [chunk("a", 0.4), chunk("b", 0.9)]
    },
    lexicalSearch: async (query, limit) => {
      calls.lexical = { query, limit }
      return [chunk("b", 0.7), chunk("c", 0.8)]
    },
    mergeRankedChunks: (vector, lexical, limit) => {
      const map = new Map<string, RetrievedChunk>()
      for (const candidate of [...vector, ...lexical]) {
        const existing = map.get(candidate.chunkId)
        if (!existing || candidate.score > existing.score) {
          map.set(candidate.chunkId, candidate)
        }
      }
      return [...map.values()].sort((left, right) => right.score - left.score).slice(0, limit)
    },
    topKVector: 5,
    topKLexical: 7,
    topKFinal: 2
  })

  const result = await run("who met whom")

  expect(calls.vector).toEqual({ embedding: [0.11, 0.22], limit: 5 })
  expect(calls.lexical).toEqual({ query: "who met whom", limit: 7 })
  expect(result.map((entry) => entry.chunkId)).toEqual(["b", "c"])
})
