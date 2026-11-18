import { ExternalServiceError } from "@/lib/errors"
import { env } from "@/lib/env"
import type { LlmGenerateInput, LlmGenerateOutput, LlmProvider } from "@/server/llm/types"
import { Schema } from "effect"

const OpenAiCompatibleResponseSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: Schema.String
      })
    })
  ),
  usage: Schema.optional(Schema.Unknown)
})

const UsageSchema = Schema.Struct({
  prompt_tokens: Schema.optional(Schema.Number),
  completion_tokens: Schema.optional(Schema.Number),
  total_tokens: Schema.optional(Schema.Number)
})

const decodeUsage = (value: unknown): { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined => {
  if (value == null) return undefined
  return Schema.decodeUnknownSync(UsageSchema)(value)
}

const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))

  try {
    return await run(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ExternalServiceError("LLM request timeout")
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransientStatus = (status: number): boolean => status === 429 || status >= 500

const requestWithRetry = async (input: LlmGenerateInput): Promise<LlmGenerateOutput> => {
  const maxAttempts = 3
  let delayMs = 300

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(async (signal) => {
        const response = await fetch(`${env.llm.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.llm.apiKey}`,
            "Content-Type": "application/json",
            "x-request-id": input.requestId ?? ""
          },
          body: JSON.stringify({
            model: env.llm.model,
            messages: input.messages,
            temperature: input.temperature ?? env.llm.temperature,
            max_tokens: input.maxOutputTokens ?? env.llm.maxOutputTokens,
            // Qwen3 hybrid models on the SwissAI LB otherwise spend the
            // completion budget on hidden reasoning and can return empty
            // content. RAG answers are grounded in the supplied passages, so
            // answer directly and keep the latency predictable.
            chat_template_kwargs: { enable_thinking: false },
            stream: input.stream ?? false
          }),
          signal
        })

        if (!response.ok) {
          const detail = { status: response.status, body: await response.text() }
          if (isTransientStatus(response.status)) {
            throw new ExternalServiceError("OpenAI-compatible transient error", detail)
          }
          throw new ExternalServiceError("OpenAI-compatible request failed", detail)
        }

        const payload = Schema.decodeUnknownSync(OpenAiCompatibleResponseSchema)(await response.json())
        const text = payload.choices[0]?.message?.content
        if (!text) {
          throw new ExternalServiceError("Unexpected OpenAI-compatible response")
        }

        const usage = decodeUsage(payload.usage)

        return {
          text,
          usage: {
            inputTokens: usage?.prompt_tokens,
            outputTokens: usage?.completion_tokens,
            totalTokens: usage?.total_tokens
          },
          providerRequestId: response.headers.get("x-request-id") ?? undefined,
          raw: payload
        }
      }, env.llm.timeoutMs)
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error instanceof ExternalServiceError ? error : new ExternalServiceError("OpenAI-compatible request failed", error)
      }
      const status = (error as { detail?: { status?: number } })?.detail?.status
      if (typeof status === "number" && !isTransientStatus(status)) {
        throw error
      }
      await sleep(delayMs + Math.round(Math.random() * 100))
      delayMs *= 2
    }
  }

  throw new ExternalServiceError("OpenAI-compatible request failed")
}

export const OpenAiCompatibleLlmProvider: LlmProvider = {
  name: "openai-compatible",
  async generate(input: LlmGenerateInput): Promise<LlmGenerateOutput> {
    if (!env.llm.apiKey || !env.llm.baseUrl || !env.llm.model) {
      throw new ExternalServiceError("OpenAI-compatible provider is not configured")
    }

    return requestWithRetry(input)
  },
  async healthcheck() {
    return { ok: Boolean(env.llm.apiKey && env.llm.baseUrl && env.llm.model) }
  }
}
