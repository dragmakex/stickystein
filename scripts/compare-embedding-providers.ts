import { readFile } from "node:fs/promises"

const texts = [
  "A person wrote a letter on Tuesday morning.",
  "The document records a meeting in New York.",
  "A short question about a public record."
]
const dimensions = 128
const model = "Qwen/Qwen3-Embedding-8B"
const localModel = "qwen3-embedding:8b"

const envFile = await readFile(".env", "utf8")
const apiKey = envFile.match(/^EMBEDDING_API_KEY=(.*)$/m)?.[1]
if (!apiKey) throw new Error("EMBEDDING_API_KEY is missing from .env")

const embed = async (url: string, modelName: string, key?: string): Promise<number[][]> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({ model: modelName, input: texts, dimensions }),
    signal: AbortSignal.timeout(300_000)
  })
  if (!response.ok) throw new Error(`${modelName} returned HTTP ${response.status}: ${await response.text()}`)

  const payload = await response.json() as { data?: Array<{ embedding?: number[]; index?: number }> }
  const vectors = payload.data?.sort((left, right) => (left.index ?? 0) - (right.index ?? 0)).map((entry) => entry.embedding)
  if (!vectors || vectors.length !== texts.length || vectors.some((vector) => vector?.length !== dimensions)) {
    throw new Error(`${modelName} returned unexpected embedding dimensions or count`)
  }
  return vectors as number[][]
}

const cosine = (left: number[], right: number[]): number => {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }
  return dot / Math.sqrt(leftNorm * rightNorm)
}

const [remote, local] = await Promise.all([
  embed("https://api.tokenfactory.nebius.com/v1/embeddings", model, apiKey),
  embed("http://127.0.0.1:11434/v1/embeddings", localModel)
])

for (let index = 0; index < texts.length; index += 1) {
  console.log(`Sample ${index + 1}: cosine similarity ${cosine(remote[index], local[index]).toFixed(4)}`)
}
