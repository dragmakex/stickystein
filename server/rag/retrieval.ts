import { env } from "@/lib/env"
import { embeddingProvider } from "@/server/embeddings/client"
import { lexicalSearch, vectorSearch, type RetrievedChunk } from "@/server/repositories/chunks-repo"
import { mergeRankedChunks } from "@/server/rag/ranking"

export type HybridRetrieveDependencies = {
  readonly embeddingProvider: typeof embeddingProvider
  readonly vectorSearch: typeof vectorSearch
  readonly lexicalSearch: typeof lexicalSearch
  readonly mergeRankedChunks: typeof mergeRankedChunks
  readonly topKVector: number
  readonly topKLexical: number
  readonly topKFinal: number
}

const defaultDependencies: HybridRetrieveDependencies = {
  embeddingProvider,
  vectorSearch,
  lexicalSearch,
  mergeRankedChunks,
  topKVector: env.rag.topKVector,
  topKLexical: env.rag.topKLexical,
  topKFinal: env.rag.topKFinal
}

export const createHybridRetrieve = (dependencies: HybridRetrieveDependencies) => async (
  query: string
): Promise<ReadonlyArray<RetrievedChunk>> => {
  const embedder = dependencies.embeddingProvider()
  const [embedding] = await embedder.embedTexts([query])
  const [vector, lexical] = await Promise.all([
    dependencies.vectorSearch(embedding, dependencies.topKVector),
    dependencies.lexicalSearch(query, dependencies.topKLexical)
  ])

  return dependencies.mergeRankedChunks(vector, lexical, dependencies.topKFinal)
}

export const hybridRetrieve = createHybridRetrieve(defaultDependencies)
