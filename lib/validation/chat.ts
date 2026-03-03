import { Schema } from "effect"

import { ValidationError } from "@/lib/errors"

export const ChatRequestSchema = Schema.Struct({
  threadId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  question: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4000))
})

export type ChatRequest = typeof ChatRequestSchema.Type

export const decodeChatRequest = (input: unknown): ChatRequest => {
  try {
    return Schema.decodeUnknownSync(ChatRequestSchema)(input)
  } catch (error) {
    throw new ValidationError("Invalid chat request", error)
  }
}
