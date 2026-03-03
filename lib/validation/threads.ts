import { Schema } from "effect"

import { ValidationError } from "@/lib/errors"

export const CreateThreadRequestSchema = Schema.Struct({
  title: Schema.optional(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)))
})

export const MessagesQuerySchema = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 100)))
})

export const ThreadParamsSchema = Schema.Struct({
  threadId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128))
})

export type CreateThreadRequest = typeof CreateThreadRequestSchema.Type
export type MessagesQuery = typeof MessagesQuerySchema.Type
export type ThreadParams = typeof ThreadParamsSchema.Type

export const decodeCreateThreadRequest = (input: unknown): CreateThreadRequest => {
  try {
    return Schema.decodeUnknownSync(CreateThreadRequestSchema)(input)
  } catch (error) {
    throw new ValidationError("Invalid thread create request", error)
  }
}

export const decodeMessagesQuery = (input: unknown): MessagesQuery => {
  try {
    return Schema.decodeUnknownSync(MessagesQuerySchema)(input)
  } catch (error) {
    throw new ValidationError("Invalid messages query", error)
  }
}

export const decodeThreadParams = (input: unknown): ThreadParams => {
  try {
    return Schema.decodeUnknownSync(ThreadParamsSchema)(input)
  } catch (error) {
    throw new ValidationError("Invalid thread params", error)
  }
}
