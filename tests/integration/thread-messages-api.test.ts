import { expect, test } from "bun:test"

import { createThreadMessagesGetHandler, type ThreadMessagesGetDependencies } from "@/app/api/threads/[threadId]/messages/route"
import { ForbiddenError } from "@/lib/errors"
import { errorResponse, ok } from "@/lib/http"
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/utils/pagination"
import { decodeMessagesQuery, decodeThreadParams } from "@/lib/validation/threads"

const makeDeps = (overrides: Partial<ThreadMessagesGetDependencies> = {}): ThreadMessagesGetDependencies => ({
  requestIdFromRequest: () => "req_messages",
  decodeThreadParams,
  decodeMessagesQuery,
  decodeMessageCursor,
  getOrCreateSession: async () => ({ sessionKey: "session_key_1", sessionId: "session_1" }),
  assertThreadOwnership: async () => {},
  listThreadMessages: async () => [],
  encodeMessageCursor,
  ok,
  errorResponse,
  ...overrides
})

test("thread messages api paginates and returns next cursor", async () => {
  const response = await createThreadMessagesGetHandler(
    makeDeps({
      listThreadMessages: async () => [
        {
          id: "msg_1",
          role: "user",
          content: "One",
          citations: null,
          retrievalMeta: null,
          createdAt: "2026-02-25T00:00:01.000Z"
        },
        {
          id: "msg_2",
          role: "assistant",
          content: "Two",
          citations: [],
          retrievalMeta: {},
          createdAt: "2026-02-25T00:00:02.000Z"
        },
        {
          id: "msg_3",
          role: "assistant",
          content: "Three",
          citations: [],
          retrievalMeta: {},
          createdAt: "2026-02-25T00:00:03.000Z"
        }
      ]
    })
  )(
    new Request("http://localhost/api/threads/thr_1/messages?limit=2"),
    { params: Promise.resolve({ threadId: "thr_1" }) }
  )

  expect(response.status).toBe(200)
  expect(response.headers.get("x-request-id")).toBe("req_messages")

  const body = await response.json()
  expect(body.threadId).toBe("thr_1")
  expect(body.messages).toHaveLength(2)
  expect(typeof body.nextCursor).toBe("string")
})

test("thread messages api rejects invalid cursor", async () => {
  const response = await createThreadMessagesGetHandler(makeDeps())(
    new Request("http://localhost/api/threads/thr_1/messages?cursor=not-base64"),
    { params: Promise.resolve({ threadId: "thr_1" }) }
  )

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: { code: "validation_error", message: "Invalid cursor" }
  })
})

test("thread messages api enforces ownership", async () => {
  const response = await createThreadMessagesGetHandler(
    makeDeps({
      assertThreadOwnership: async () => {
        throw new ForbiddenError("Thread does not belong to this session")
      }
    })
  )(
    new Request("http://localhost/api/threads/thr_2/messages"),
    { params: Promise.resolve({ threadId: "thr_2" }) }
  )

  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    error: { code: "forbidden", message: "Thread does not belong to this session" }
  })
})
