import { expect, test } from "bun:test"
import { Schema } from "effect"

const Example = Schema.Struct({ value: Schema.String.pipe(Schema.minLength(1)) })

test("effect schema decodes happy path", () => {
  const decode = Schema.decodeUnknownSync(Example)
  expect(decode({ value: "x" }).value).toBe("x")
})
