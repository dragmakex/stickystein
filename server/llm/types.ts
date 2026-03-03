export type LlmMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export type LlmGenerateInput = {
  readonly messages: ReadonlyArray<LlmMessage>
  readonly temperature?: number
  readonly maxOutputTokens?: number
  readonly stream?: boolean
  readonly requestId?: string
}

export type LlmGenerateOutput = {
  readonly text: string
  readonly usage?: {
    readonly inputTokens?: number
    readonly outputTokens?: number
    readonly totalTokens?: number
  }
  readonly providerRequestId?: string
  readonly raw?: unknown
}

export interface LlmProvider {
  readonly name: string
  generate(input: LlmGenerateInput): Promise<LlmGenerateOutput>
  healthcheck?(): Promise<{ ok: boolean; detail?: string }>
}
