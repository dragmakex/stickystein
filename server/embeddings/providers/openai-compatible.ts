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

const zeroVector = (): ReadonlyArray<number> => Array.from({ length: env.embeddings.dimensions }, () => 0)

const normalizeEmbeddingInput = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const isProviderNanFailure = (error: unknown): boolean => {
  if (!(error instanceof ExternalServiceError)) return false
  const detail = error.detail
  if (!detail || typeof detail !== "object") return false

  const status = "status" in detail ? detail.status : undefined
  const body = "body" in detail ? detail.body : undefined
  return status === 500 && typeof body === "string" && body.includes("unsupported value: NaN")
}

const assertVectors = (vectors: ReadonlyArray<ReadonlyArray<number>>): void => {
  if (vectors.some((vector) => vector.length !== env.embeddings.dimensions)) {
    throw new ExternalServiceError("Embedding dimensions mismatch")
  }
  if (vectors.some((vector) => vector.some((value) => !Number.isFinite(value)))) {
    throw new ExternalServiceError("Embedding provider returned non-finite values")
  }
}

const requestEmbeddings = async (batch: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<number>>> => {
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
      assertVectors(vectors)
      return vectors
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

  throw new ExternalServiceError("Embedding request failed")
}

const embedBatchWithFallback = async (batch: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<number>>> => {
  try {
    return await requestEmbeddings(batch)
  } catch (error) {
    if (!isProviderNanFailure(error)) throw error

    if (batch.length > 1) {
      const midpoint = Math.ceil(batch.length / 2)
      const left = await embedBatchWithFallback(batch.slice(0, midpoint))
      const right = await embedBatchWithFallback(batch.slice(midpoint))
      return [...left, ...right]
    }

    const [original] = batch
    const normalized = normalizeEmbeddingInput(original)
    if (normalized && normalized !== original) {
      try {
        return await requestEmbeddings([normalized])
      } catch (normalizedError) {
        if (!isProviderNanFailure(normalizedError)) throw normalizedError
      }
    }

    console.warn("Embedding provider returned NaN for a single chunk; falling back to zero vector")
    return [zeroVector()]
  }
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
      const normalizedBatch = batch.map(normalizeEmbeddingInput)
      const vectors = await embedBatchWithFallback(normalizedBatch)
      allVectors.push(...vectors)
    }

    return allVectors
  }
}
