import { llmProvider } from "@/server/llm/client"

const provider = llmProvider()
const health = await provider.healthcheck?.()
console.log("Provider:", provider.name)
console.log("Health:", health ?? { ok: "unknown" })

if (provider.name === "mock") {
  console.log("Mock provider is active; set LLM_PROVIDER and GLM_* env vars for real smoke test")
  process.exit(0)
}

const result = await provider.generate({
  messages: [
    { role: "system", content: "Reply in exactly three words." },
    { role: "user", content: "This is a smoke test." }
  ],
  maxOutputTokens: 20
})

console.log("Response:", result.text)
