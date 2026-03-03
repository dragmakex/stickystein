import { expect, test } from "bun:test"

import { decodeChatRequest } from "@/lib/validation/chat"
import { decodeThreadParams } from "@/lib/validation/threads"

test("chat schema validates required fields", () => {
  const parsed = decodeChatRequest({ threadId: "thr_1", question: "hello" })
  expect(parsed.threadId).toBe("thr_1")
})

test("chat schema rejects invalid payload", () => {
  expect(() => decodeChatRequest({ threadId: "", question: "" })).toThrow()
})

test("thread params schema rejects empty threadId", () => {
  expect(() => decodeThreadParams({ threadId: "" })).toThrow()
})
