import { env } from "@/lib/env"
import type { RetrievedChunk } from "@/server/repositories/chunks-repo"

export const assembleContextChunks = (
  chunks: ReadonlyArray<RetrievedChunk>,
  maxChars = env.rag.maxContextChars
): ReadonlyArray<RetrievedChunk> => {
  const output: RetrievedChunk[] = []
  let used = 0

  for (const chunk of chunks) {
    if (used + chunk.text.length > maxChars) break
    output.push(chunk)
    used += chunk.text.length
  }

  return output
}
