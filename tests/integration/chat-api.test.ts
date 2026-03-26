import { expect, test } from "bun:test"

import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/errors"
import { errorResponse, ok } from "@/lib/http"
import { createChatPostHandler, type ChatPostDependencies } from "@/app/api/chat/route"

const makeDeps = (overrides: Partial<ChatPostDependencies> = {}): ChatPostDependencies => ({
  requestIdFromRequest: () => "req_test",
  parseJsonBody: async () => ({ threadId: "thread_1", question: "What happened?" }),
  decodeChatRequest: (input) => input as { threadId: string; question: string },
  getOrCreateSession: async () => ({ sessionKey: "session_key_1", sessionId: "session_1" }),
  assertThreadOwnership: async () => {},
  clientIpFromRequest: () => "203.0.113.10",
  enforceRateLimit: async () => {},
  answerQuestion: async () => ({
    userMessageId: "msg_user_1",
    assistantMessageId: "msg_assistant_1",
    answer: "Grounded answer.",
    citations: [],
    retrievalMeta: { candidateCount: 3, selectedCount: 2 }
  }),
  ok,
  errorResponse,
  ...overrides
})

test("chat api returns grounded payload on success", async () => {
  const captured: Array<{ subjectKey: string; routeKey: string; windowSec: number; max: number }> = []
  const handler = createChatPostHandler(
    makeDeps({
      enforceRateLimit: async (input) => {
        captured.push(input)
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8", "x-request-id": "req_incoming" },
      body: JSON.stringify({ threadId: "thread_1", question: "What happened?" })
    })
  )

  expect(response.status).toBe(200)
  expect(response.headers.get("x-request-id")).toBe("req_test")
  expect(captured).toEqual([{ subjectKey: "203.0.113.10:session_1", routeKey: "chat", windowSec: 60, max: 10 }])
  expect(await response.json()).toEqual({
    threadId: "thread_1",
    userMessageId: "msg_user_1",
    assistantMessageId: "msg_assistant_1",
    answer: "Grounded answer.",
    citations: [],
    retrievalMeta: { candidateCount: 3, selectedCount: 2 }
  })
})

test("chat api rejects invalid payload with 400", async () => {
  const handler = createChatPostHandler(
    makeDeps({
      decodeChatRequest: () => {
        throw new ValidationError("Invalid chat request")
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })
  )

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: { code: "validation_error", message: "Invalid chat request" }
  })
})

test("chat api enforces thread ownership checks", async () => {
  const handler = createChatPostHandler(
    makeDeps({
      assertThreadOwnership: async () => {
        throw new ForbiddenError("Thread does not belong to this session")
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "thread_2", question: "Who is in this thread?" })
    })
  )

  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    error: { code: "forbidden", message: "Thread does not belong to this session" }
  })
})

test("chat api rate limits abusive clients", async () => {
  const handler = createChatPostHandler(
    makeDeps({
      enforceRateLimit: async () => {
        throw new RateLimitError("Too many requests")
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "thread_3", question: "Please answer quickly." })
    })
  )

  expect(response.status).toBe(429)
  expect(await response.json()).toEqual({
    error: { code: "rate_limited", message: "Too many requests" }
  })
})
