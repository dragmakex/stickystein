import { env } from "@/lib/env"

export const config = {
  llmTimeoutMs: env.llm.timeoutMs,
  chatConcurrencyLimit: 4,
  maxQuestionChars: 4000,
  maxThreadTitleChars: 200,
  dataDir: "data"
}
