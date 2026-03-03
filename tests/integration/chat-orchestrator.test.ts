import { expect, test } from "bun:test"

import { createAnswerQuestion } from "@/server/rag/answer-orchestrator"
import { toCitation } from "@/server/rag/citations"
import type { RetrievedChunk } from "@/server/repositories/chunks-repo"

const sampleChunk: RetrievedChunk = {
  chunkId: "chk_1",
  documentId: "doc_1",
  filename: "bad<>.pdf",
  pageNumber: 4,
  text: "Known facts from source.",
  snippet: "<script>alert(1)</script> snippet",
  score: 0.98
}

test("answer orchestrator generates grounded answer with citations and metadata", async () => {
  const inserted: Array<{ role: string; content: string; citations?: unknown; retrievalMeta?: unknown }> = []
  const llmCalls: Array<{ messages: ReadonlyArray<{ role: string; content: string }> }> = []

  let count = 0
  const answerQuestion = createAnswerQuestion({
    insertMessage: async (input) => {
      inserted.push(input)
      count += 1
      return { id: `msg_${count}`, createdAt: new Date().toISOString() }
    },
    hybridRetrieve: async () => [sampleChunk],
    assembleContextChunks: (chunks) => chunks,
    llmProvider: () => ({
      name: "test-llm",
      generate: async (request) => {
        llmCalls.push(request)
        return { text: "Grounded answer from evidence." }
      }
    }),
    baseSystemPrompt: "system",
    buildUserPrompt: (question, chunks) => `${question}::${chunks.length}`,
    toCitation,
    noEvidenceResponse: "no evidence",
    temporaryFailureResponse: "temporary failure"
  })

  const result = await answerQuestion("thr_1", "What does the record show?")

  expect(llmCalls).toHaveLength(1)
  expect(inserted).toHaveLength(2)
  expect(result.userMessageId).toBe("msg_1")
  expect(result.assistantMessageId).toBe("msg_2")
  expect(result.answer).toBe("Grounded answer from evidence.")
  expect(result.retrievalMeta).toEqual({ candidateCount: 1, selectedCount: 1 })
  expect(result.citations).toEqual([
    {
      documentId: "doc_1",
      filename: "bad.pdf",
      pageNumber: 4,
      chunkId: "chk_1",
      snippet: "scriptalert(1)/script snippet"
    }
  ])
})

test("answer orchestrator returns no-evidence fallback without calling llm", async () => {
  let llmCalled = false

  let count = 0
  const answerQuestion = createAnswerQuestion({
    insertMessage: async () => {
      count += 1
      return { id: `msg_${count}`, createdAt: new Date().toISOString() }
    },
    hybridRetrieve: async () => [],
    assembleContextChunks: () => [],
    llmProvider: () => ({
      name: "test-llm",
      generate: async () => {
        llmCalled = true
        return { text: "should not be used" }
      }
    }),
    baseSystemPrompt: "system",
    buildUserPrompt: () => "unused",
    toCitation,
    noEvidenceResponse: "No evidence found.",
    temporaryFailureResponse: "Temporary failure."
  })

  const result = await answerQuestion("thr_2", "Unknown query")

  expect(llmCalled).toBe(false)
  expect(result.answer).toBe("No evidence found.")
  expect(result.citations).toEqual([])
  expect(result.retrievalMeta).toEqual({ candidateCount: 0, selectedCount: 0 })
})

test("answer orchestrator returns temporary fallback when llm generation fails", async () => {
  let count = 0
  const answerQuestion = createAnswerQuestion({
    insertMessage: async () => {
      count += 1
      return { id: `msg_${count}`, createdAt: new Date().toISOString() }
    },
    hybridRetrieve: async () => [sampleChunk],
    assembleContextChunks: (chunks) => chunks,
    llmProvider: () => ({
      name: "test-llm",
      generate: async () => {
        throw new Error("provider unavailable")
      }
    }),
    baseSystemPrompt: "system",
    buildUserPrompt: () => "unused",
    toCitation,
    noEvidenceResponse: "No evidence found.",
    temporaryFailureResponse: "Temporary failure."
  })

  const result = await answerQuestion("thr_3", "Question")

  expect(result.answer).toBe("Temporary failure.")
  expect(result.citations).toHaveLength(1)
  expect(result.retrievalMeta).toEqual({ candidateCount: 1, selectedCount: 1 })
})

test("answer orchestrator degrades to no-evidence fallback when retrieval fails", async () => {
  let llmCalled = false
  let count = 0
  const answerQuestion = createAnswerQuestion({
    insertMessage: async () => {
      count += 1
      return { id: `msg_${count}`, createdAt: new Date().toISOString() }
    },
    hybridRetrieve: async () => {
      throw new Error("vector index unavailable")
    },
    assembleContextChunks: () => [],
    llmProvider: () => ({
      name: "test-llm",
      generate: async () => {
        llmCalled = true
        return { text: "unexpected" }
      }
    }),
    baseSystemPrompt: "system",
    buildUserPrompt: () => "unused",
    toCitation,
    noEvidenceResponse: "No evidence found.",
    temporaryFailureResponse: "Temporary failure."
  })

  const result = await answerQuestion("thr_4", "Question")

  expect(llmCalled).toBe(false)
  expect(result.answer).toBe("No evidence found.")
  expect(result.citations).toEqual([])
  expect(result.retrievalMeta).toEqual({ candidateCount: 0, selectedCount: 0 })
})
