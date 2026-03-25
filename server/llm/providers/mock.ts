import type { LlmGenerateInput, LlmGenerateOutput, LlmProvider } from "@/server/llm/types"

export const MockLlmProvider: LlmProvider = {
  name: "mock",
  async generate(input: LlmGenerateInput): Promise<LlmGenerateOutput> {
    const latestUser = [...input.messages].reverse().find((message) => message.role === "user")
    return {
      text: `Mock grounded answer: ${latestUser?.content ?? ""}`,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      providerRequestId: "mock-req"
    }
  },
  async streamGenerate(input, onDelta) {
    const output = await this.generate(input)
    await onDelta(output.text)
    return output
  },
  async healthcheck() {
    return { ok: true }
  }
}
