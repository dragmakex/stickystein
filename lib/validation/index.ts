import { Schema } from "effect"

import { ValidationError } from "@/lib/errors"

export const RetryIndexJobParamsSchema = Schema.Struct({
  jobId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128))
})

export type RetryIndexJobParams = typeof RetryIndexJobParamsSchema.Type

export const decodeRetryJobParams = (input: unknown): RetryIndexJobParams => {
  try {
    return Schema.decodeUnknownSync(RetryIndexJobParamsSchema)(input)
  } catch (error) {
    throw new ValidationError("Invalid retry job params", error)
  }
}
