import { withDb } from "@/db/client"
import { env } from "@/lib/env"
import { embeddingProvider } from "@/server/embeddings/client"

type Sample = { chunkId: string; text: string; stored: string }

const cosineSimilarity = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
  if (left.length !== right.length) throw new Error("Embedding dimensions differ")

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  if (leftNorm === 0 || rightNorm === 0) throw new Error("Encountered a zero vector")
  return dot / Math.sqrt(leftNorm * rightNorm)
}

const samples = await withDb((sql) => sql<Sample[]>`
  SELECT c.id AS "chunkId", c.text, c.embedding::text AS stored
  FROM document_chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.status = 'ready'
    AND d.source_path LIKE 'VOL00010/%'
    AND c.embedding IS NOT NULL
    AND length(c.text) BETWEEN 100 AND 2000
  LIMIT 5
`)

if (samples.length === 0) throw new Error("No stored embeddings found in VOL00010")

const fresh = await embeddingProvider().embedTexts(samples.map((sample) => sample.text))
if (fresh.length !== samples.length) throw new Error("Embedding provider returned the wrong number of vectors")

console.log(`Comparing ${samples.length} existing chunks with ${env.embeddings.model} (${env.embeddings.dimensions} dimensions)`)
for (const [index, sample] of samples.entries()) {
  const stored = JSON.parse(sample.stored) as number[]
  console.log(`${sample.chunkId}: cosine similarity ${cosineSimilarity(stored, fresh[index]).toFixed(4)}`)
}
