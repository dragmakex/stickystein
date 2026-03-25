import { env } from "@/lib/env"
import { toAppError } from "@/lib/errors"
import { parseJsonBody, requestIdFromRequest } from "@/lib/http"
import { securityHeaders } from "@/lib/security/headers"
import { clientIpFromRequest } from "@/lib/security/request"
import { decodeChatRequest } from "@/lib/validation/chat"
import { getOrCreateSession } from "@/server/chat/sessions"
import { assertThreadOwnership } from "@/server/chat/threads"
import { llmProvider } from "@/server/llm/client"
import { baseSystemPrompt, buildUserPrompt } from "@/server/llm/prompts"
import { enforceRateLimit } from "@/server/rate-limit/limiter"
import { routeKeys, subjectKey } from "@/server/rate-limit/keys"
import { toCitation } from "@/server/rag/citations"
import { assembleContextChunks } from "@/server/rag/context-assembly"
import { hybridRetrieve } from "@/server/rag/retrieval"
import { insertMessage } from "@/server/repositories/chat-repo"
import { stripThinkBlocks } from "@/lib/utils/text"

const NO_EVIDENCE_RESPONSE = "I could not find enough evidence in the indexed documents. Please try a more specific question."
const RETRIEVAL_FAILURE_RESPONSE = "I could not search the indexed documents right now. Please try again in a moment."
const TEMPORARY_FAILURE_RESPONSE = "I could not complete answer generation right now. Please try again in a moment."

const sseEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

export const POST = async (request: Request) => {
  const requestId = requestIdFromRequest(request)

  try {
    const rawBody = await parseJsonBody(request, { maxBytes: 16 * 1024 })
    const body = decodeChatRequest(rawBody)
    const session = await getOrCreateSession()
    await assertThreadOwnership(body.threadId, session.sessionId)
    await enforceRateLimit({
      subjectKey: subjectKey(clientIpFromRequest(request), session.sessionId),
      routeKey: routeKeys.chat,
      windowSec: env.rateLimit.chatWindowSec,
      max: env.rateLimit.chatMax
    })

    const userMessage = await insertMessage({ threadId: body.threadId, role: "user", content: body.question })

    let retrieved = [] as Awaited<ReturnType<typeof hybridRetrieve>>
    let retrievalFailed = false
    try {
      retrieved = await hybridRetrieve(body.question)
    } catch {
      retrievalFailed = true
    }
    const selected = assembleContextChunks(retrieved)
    const citations = retrievalFailed ? [] : selected.map(toCitation)

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(event, data)))

        void (async () => {
          try {
            send("meta", { requestId, threadId: body.threadId, userMessageId: userMessage.id })

            if (retrievalFailed) {
              const assistantMessage = await insertMessage({
                threadId: body.threadId,
                role: "assistant",
                content: RETRIEVAL_FAILURE_RESPONSE,
                citations: [],
                retrievalMeta: { candidateCount: 0, selectedCount: 0 }
              })
              send("delta", { text: RETRIEVAL_FAILURE_RESPONSE })
              send("done", {
                threadId: body.threadId,
                assistantMessageId: assistantMessage.id,
                retrievalMeta: { candidateCount: 0, selectedCount: 0 }
              })
              controller.close()
              return
            }

            if (selected.length === 0) {
              const assistantMessage = await insertMessage({
                threadId: body.threadId,
                role: "assistant",
                content: NO_EVIDENCE_RESPONSE,
                citations: [],
                retrievalMeta: { candidateCount: retrieved.length, selectedCount: 0 }
              })
              send("delta", { text: NO_EVIDENCE_RESPONSE })
              send("done", {
                threadId: body.threadId,
                assistantMessageId: assistantMessage.id,
                retrievalMeta: { candidateCount: retrieved.length, selectedCount: 0 }
              })
              controller.close()
              return
            }

            const provider = llmProvider()
            let generatedText = ""

            if (provider.streamGenerate) {
              const streamed = await provider.streamGenerate(
                {
                  messages: [
                    { role: "system", content: baseSystemPrompt },
                    { role: "user", content: buildUserPrompt(body.question, selected) }
                  ],
                  requestId
                },
                async (delta) => {
                  generatedText += delta
                  send("delta", { text: delta })
                }
              )
              generatedText = streamed.text
            } else {
              const generated = await provider.generate({
                messages: [
                  { role: "system", content: baseSystemPrompt },
                  { role: "user", content: buildUserPrompt(body.question, selected) }
                ],
                requestId
              })
              generatedText = generated.text
              send("delta", { text: generatedText })
            }

            const cleanedAnswer = stripThinkBlocks(generatedText || TEMPORARY_FAILURE_RESPONSE)
            const assistantMessage = await insertMessage({
              threadId: body.threadId,
              role: "assistant",
              content: cleanedAnswer,
              citations,
              retrievalMeta: {
                candidateCount: retrieved.length,
                selectedCount: selected.length
              }
            })

            send("done", {
              threadId: body.threadId,
              assistantMessageId: assistantMessage.id,
              retrievalMeta: { candidateCount: retrieved.length, selectedCount: selected.length }
            })
            controller.close()
          } catch (error) {
            const appError = toAppError(error)
            send("error", { code: appError.code, message: appError.message })
            controller.close()
          }
        })()
      }
    })

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-request-id": requestId
    })
    for (const [key, value] of Object.entries(securityHeaders)) {
      headers.set(key, value)
    }

    return new Response(stream, { headers })
  } catch (error) {
    const appError = toAppError(error)
    const body = JSON.stringify({
      error: {
        code: appError.code,
        message: appError.message
      }
    })
    const headers = new Headers({ "Content-Type": "application/json", "x-request-id": requestId })
    for (const [key, value] of Object.entries(securityHeaders)) {
      headers.set(key, value)
    }
    return new Response(body, { status: appError.status, headers })
  }
}
