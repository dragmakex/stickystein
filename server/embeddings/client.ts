import { env } from "@/lib/env"
import { OpenAiCompatibleEmbeddingProvider } from "@/server/embeddings/providers/openai-compatible"
import { MockEmbeddingProvider } from "@/server/embeddings/providers/mock"
import type { EmbeddingProvider } from "@/server/embeddings/types"

export const embeddingProvider = (): EmbeddingProvider => {
  if (env.embeddings.provider === "mock") return MockEmbeddingProvider
  return OpenAiCompatibleEmbeddingProvider
}
