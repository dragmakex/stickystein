import { expect, test } from "bun:test"

import { chunkDocumentPages } from "@/server/rag/chunking"

test("chunking is deterministic", () => {
  const input = [{ documentId: "doc_1", pageNumber: 1, text: "a".repeat(120) }]
  const first = chunkDocumentPages(input, 50, 10)
  const second = chunkDocumentPages(input, 50, 10)

  expect(first.map((chunk) => chunk.text)).toEqual(second.map((chunk) => chunk.text))
})
