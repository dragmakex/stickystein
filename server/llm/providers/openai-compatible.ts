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
  usage: Schema.optional(
    Schema.Struct({
      prompt_tokens: Schema.optional(Schema.Number),
      completion_tokens: Schema.optional(Schema.Number),
      total_tokens: Schema.optional(Schema.Number)
    })
  )
})

const OpenAiCompatibleStreamChunkSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      delta: Schema.optional(
        Schema.Struct({
          content: Schema.optional(Schema.String)
        })
      )
    })
  ),
  usage: Schema.optional(
    Schema.Struct({
      prompt_tokens: Schema.optional(Schema.Number),
      completion_tokens: Schema.optional(Schema.Number),
      total_tokens: Schema.optional(Schema.Number)
    })
  )
})

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

        return {
          text,
          usage: {
            inputTokens: payload.usage?.prompt_tokens,
            outputTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens
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
  async streamGenerate(input: LlmGenerateInput, onDelta): Promise<LlmGenerateOutput> {
    if (!env.llm.apiKey || !env.llm.baseUrl || !env.llm.model) {
      throw new ExternalServiceError("OpenAI-compatible provider is not configured")
    }

    return withTimeout(async (signal) => {
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
          stream: true
        }),
        signal
      })

      if (!response.ok) {
        throw new ExternalServiceError("OpenAI-compatible request failed", {
          status: response.status,
          body: await response.text()
        })
      }

      if (!response.body) {
        throw new ExternalServiceError("OpenAI-compatible stream body missing")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let text = ""
      let usage: LlmGenerateOutput["usage"] | undefined

      const processEvent = async (rawEvent: string): Promise<boolean> => {
        for (const line of rawEvent.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          if (payload === "[DONE]") return true

          const parsed = Schema.decodeUnknownSync(OpenAiCompatibleStreamChunkSchema)(JSON.parse(payload))
          const delta = parsed.choices[0]?.delta?.content ?? ""
          if (delta) {
            text += delta
            await onDelta(delta)
          }
          if (parsed.usage) {
            usage = {
              inputTokens: parsed.usage.prompt_tokens,
              outputTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens
            }
          }
        }

        return false
      }

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const finished = await processEvent(rawEvent)
          if (finished) {
            return {
              text,
              usage,
              providerRequestId: response.headers.get("x-request-id") ?? undefined
            }
          }
          boundary = buffer.indexOf("\n\n")
        }

        if (done) {
          if (buffer.trim()) {
            await processEvent(buffer)
          }
          break
        }
      }

      return {
        text,
        usage,
        providerRequestId: response.headers.get("x-request-id") ?? undefined
      }
    }, env.llm.timeoutMs)
  },
  async healthcheck() {
    return { ok: Boolean(env.llm.apiKey && env.llm.baseUrl && env.llm.model) }
  }
}
