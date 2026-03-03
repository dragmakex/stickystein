import { ExternalServiceError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { llmProvider } from "@/server/llm/client"
import { baseSystemPrompt, buildUserPrompt } from "@/server/llm/prompts"
import { toCitation, type Citation } from "@/server/rag/citations"
import { assembleContextChunks } from "@/server/rag/context-assembly"
import { hybridRetrieve } from "@/server/rag/retrieval"
import { insertMessage } from "@/server/repositories/chat-repo"

const NO_EVIDENCE_RESPONSE = "I could not find enough evidence in the indexed documents. Please try a more specific question."
const TEMPORARY_FAILURE_RESPONSE = "I could not complete answer generation right now. Please try again in a moment."

type FailureCategory = "retrieval_error" | "llm_timeout" | "llm_error"

export type AnswerQuestionResult = {
  userMessageId: string
  assistantMessageId: string
  answer: string
  citations: ReadonlyArray<Citation>
  retrievalMeta: { candidateCount: number; selectedCount: number }
}

export type AnswerQuestionDependencies = {
  readonly insertMessage: typeof insertMessage
  readonly hybridRetrieve: typeof hybridRetrieve
  readonly assembleContextChunks: typeof assembleContextChunks
  readonly llmProvider: typeof llmProvider
  readonly baseSystemPrompt: string
  readonly buildUserPrompt: typeof buildUserPrompt
  readonly toCitation: typeof toCitation
  readonly noEvidenceResponse: string
  readonly temporaryFailureResponse: string
}

const defaultDependencies: AnswerQuestionDependencies = {
  insertMessage,
  hybridRetrieve,
  assembleContextChunks,
  llmProvider,
  baseSystemPrompt,
  buildUserPrompt,
  toCitation,
  noEvidenceResponse: NO_EVIDENCE_RESPONSE,
  temporaryFailureResponse: TEMPORARY_FAILURE_RESPONSE
}

const categorizeLlmFailure = (error: unknown): FailureCategory => {
  if (error instanceof ExternalServiceError && error.message.toLowerCase().includes("timeout")) {
    return "llm_timeout"
  }
  return "llm_error"
}

export const createAnswerQuestion = (dependencies: AnswerQuestionDependencies) => async (
  threadId: string,
  question: string
): Promise<AnswerQuestionResult> => {
  const userMessage = await dependencies.insertMessage({ threadId, role: "user", content: question })
  let retrieved = [] as Awaited<ReturnType<typeof dependencies.hybridRetrieve>>
  try {
    retrieved = await dependencies.hybridRetrieve(question)
  } catch (error) {
    logger.error("chat.retrieval_failed", {
      category: "retrieval_error",
      threadId,
      error
    })
  }
  const selected = dependencies.assembleContextChunks(retrieved)

  let generated: { text: string }
  if (selected.length === 0) {
    generated = { text: dependencies.noEvidenceResponse }
  } else {
    try {
      const provider = dependencies.llmProvider()
      generated = await provider.generate({
        messages: [
          { role: "system", content: dependencies.baseSystemPrompt },
          { role: "user", content: dependencies.buildUserPrompt(question, selected) }
        ]
      })
    } catch (error) {
      logger.error("chat.answer_generation_failed", {
        category: categorizeLlmFailure(error),
        threadId,
        error
      })
      generated = { text: dependencies.temporaryFailureResponse }
    }
  }

  const citations = selected.map(dependencies.toCitation)

  const assistantMessage = await dependencies.insertMessage({
    threadId,
    role: "assistant",
    content: generated.text,
    citations,
    retrievalMeta: {
      candidateCount: retrieved.length,
      selectedCount: selected.length
    }
  })

  return {
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: generated.text,
    citations,
    retrievalMeta: { candidateCount: retrieved.length, selectedCount: selected.length }
  }
}

export const answerQuestion = createAnswerQuestion(defaultDependencies)
