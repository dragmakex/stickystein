import type { EmbeddingProvider } from "@/server/embeddings/types"

const hash = (value: string): number => {
  let h = 0
  for (let index = 0; index < value.length; index += 1) {
    h = (h << 5) - h + value.charCodeAt(index)
    h |= 0
  }
  return Math.abs(h)
}

export const MockEmbeddingProvider: EmbeddingProvider = {
  name: "mock",
  dimensions: 128,
  async embedTexts(texts) {
    return texts.map((text) => {
      const base = hash(text)
      return Array.from({ length: 128 }, (_, index) => ((base + index) % 1000) / 1000)
    })
  }
}
