import { expect, test } from "bun:test"

import { createThreadsPostHandler, type ThreadsPostDependencies } from "@/app/api/threads/route"
import { RateLimitError, ValidationError } from "@/lib/errors"
import { errorResponse, ok } from "@/lib/http"

const makeDeps = (overrides: Partial<ThreadsPostDependencies> = {}): ThreadsPostDependencies => ({
  requestIdFromRequest: () => "req_threads",
  parseJsonBody: async () => ({ title: "Thread A" }),
  decodeCreateThreadRequest: (input) => input as { title?: string },
  getOrCreateSession: async () => ({ sessionKey: "session_key_1", sessionId: "session_1" }),
  clientIpFromRequest: () => "198.51.100.7",
  enforceRateLimit: async () => {},
  createThreadForSession: async (_sessionId, title) => ({ id: "thr_1", title: title ?? "New Thread", createdAt: "2026-02-25T00:00:00.000Z" }),
  ok,
  errorResponse,
  ...overrides
})

test("threads api creates a thread and returns rate-limit keyed by session", async () => {
  const captured: Array<{ subjectKey: string; routeKey: string; windowSec: number; max: number }> = []
  const handler = createThreadsPostHandler(
    makeDeps({
      enforceRateLimit: async (input) => {
        captured.push(input)
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req_incoming" },
      body: JSON.stringify({ title: "Thread A" })
    })
  )

  expect(response.status).toBe(200)
  expect(response.headers.get("x-request-id")).toBe("req_threads")
  expect(captured).toEqual([{ subjectKey: "198.51.100.7:session_1", routeKey: "threads-create", windowSec: 60, max: 20 }])
  expect(await response.json()).toEqual({
    threadId: "thr_1",
    title: "Thread A",
    createdAt: "2026-02-25T00:00:00.000Z"
  })
})

test("threads api rejects invalid payload with 400", async () => {
  const handler = createThreadsPostHandler(
    makeDeps({
      decodeCreateThreadRequest: () => {
        throw new ValidationError("Invalid thread create request")
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" })
    })
  )

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: { code: "validation_error", message: "Invalid thread create request" }
  })
})

test("threads api enforces route rate limits", async () => {
  const handler = createThreadsPostHandler(
    makeDeps({
      enforceRateLimit: async () => {
        throw new RateLimitError("Too many requests")
      }
    })
  )

  const response = await handler(
    new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Thread B" })
    })
  )

  expect(response.status).toBe(429)
  expect(await response.json()).toEqual({
    error: { code: "rate_limited", message: "Too many requests" }
  })
})
