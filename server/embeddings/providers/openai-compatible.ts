import { ExternalServiceError } from "@/lib/errors"
import { env } from "@/lib/env"
import type { EmbeddingProvider } from "@/server/embeddings/types"
import { Schema } from "effect"

const EmbeddingsResponseSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      embedding: Schema.Array(Schema.Number)
    })
  )
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransientStatus = (status: number): boolean => status === 429 || status >= 500

const chunkArray = <T>(items: ReadonlyArray<T>, size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export const OpenAiCompatibleEmbeddingProvider: EmbeddingProvider = {
  name: "openai-compatible",
  dimensions: env.embeddings.dimensions,
  async embedTexts(texts) {
    if (!env.embeddings.apiKey || !env.embeddings.baseUrl || !env.embeddings.model) {
      throw new ExternalServiceError("Embedding provider is not configured")
    }

    const batches = chunkArray(texts, env.embeddings.batchSize)
    const allVectors: ReadonlyArray<number>[] = []

    for (const batch of batches) {
      const maxAttempts = 3
      let delayMs = 200

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), env.embeddings.timeoutMs)

        try {
          const response = await fetch(`${env.embeddings.baseUrl}/embeddings`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.embeddings.apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: env.embeddings.model,
              input: batch,
              dimensions: env.embeddings.dimensions
            }),
            signal: controller.signal
          })

          if (!response.ok) {
            if (isTransientStatus(response.status) && attempt < maxAttempts) {
              await sleep(delayMs + Math.round(Math.random() * 100))
              delayMs *= 2
              continue
            }
            throw new ExternalServiceError("Embedding request failed", { status: response.status, body: await response.text() })
          }

          const payload = Schema.decodeUnknownSync(EmbeddingsResponseSchema)(await response.json())
          const vectors = payload.data.map((entry) => entry.embedding)
          if (vectors.some((vector) => vector.length !== env.embeddings.dimensions)) {
            throw new ExternalServiceError("Embedding dimensions mismatch")
          }

          allVectors.push(...vectors)
          break
        } catch (error) {
          if (controller.signal.aborted) {
            throw new ExternalServiceError("Embedding request timeout")
          }
          if (attempt === maxAttempts) {
            throw error instanceof ExternalServiceError ? error : new ExternalServiceError("Embedding request failed", error)
          }
        } finally {
          clearTimeout(timer)
        }
      }
    }

    return allVectors
  }
}
