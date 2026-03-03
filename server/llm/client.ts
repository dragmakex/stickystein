import { env } from "@/lib/env"
import { GlmZhipuProvider } from "@/server/llm/providers/glm-zhipu"
import { MockLlmProvider } from "@/server/llm/providers/mock"
import type { LlmProvider } from "@/server/llm/types"

export const llmProvider = (): LlmProvider => {
  if (env.llm.provider === "mock") return MockLlmProvider
  return GlmZhipuProvider
}
