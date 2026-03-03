import { expect, test } from "bun:test"

import { mergeRankedChunks } from "@/server/rag/ranking"

const makeChunk = (chunkId: string, score: number) => ({
  chunkId,
  documentId: "doc",
  filename: "f.pdf",
  pageNumber: 1,
  text: "text",
  snippet: "snippet",
  score
})

test("mergeRankedChunks dedupes by chunk id", () => {
  const merged = mergeRankedChunks([makeChunk("a", 0.5)], [makeChunk("a", 0.8), makeChunk("b", 0.7)], 10)
  expect(merged).toHaveLength(2)
  expect(merged[0]?.chunkId).toBe("a")
})
