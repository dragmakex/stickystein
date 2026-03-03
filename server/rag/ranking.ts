import type { RetrievedChunk } from "@/server/repositories/chunks-repo"

export const mergeRankedChunks = (
  vector: ReadonlyArray<RetrievedChunk>,
  lexical: ReadonlyArray<RetrievedChunk>,
  limit: number
): ReadonlyArray<RetrievedChunk> => {
  const byChunk = new Map<string, RetrievedChunk>()

  for (const candidate of [...vector, ...lexical]) {
    const existing = byChunk.get(candidate.chunkId)
    if (!existing || candidate.score > existing.score) {
      byChunk.set(candidate.chunkId, candidate)
    }
  }

  return [...byChunk.values()].sort((left, right) => right.score - left.score).slice(0, limit)
}
