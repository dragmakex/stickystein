import { expect, test } from "bun:test"

import { toCitation } from "@/server/rag/citations"

test("citation mapper sanitizes snippet and filename", () => {
  const citation = toCitation({
    chunkId: "chk_1",
    documentId: "doc_1",
    filename: "bad<>.pdf",
    pageNumber: 2,
    text: "ignored",
    snippet: "<script>alert(1)</script>",
    score: 1
  })

  expect(citation.filename).toBe("bad.pdf")
  expect(citation.snippet.includes("<")).toBe(false)
})
