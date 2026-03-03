import { expect, test } from "bun:test"

import { createChatPostHandler, type ChatPostDependencies } from "@/app/api/chat/route"
import { createThreadMessagesGetHandler, type ThreadMessagesGetDependencies } from "@/app/api/threads/[threadId]/messages/route"
import { createThreadsPostHandler, type ThreadsPostDependencies } from "@/app/api/threads/route"
import { ForbiddenError } from "@/lib/errors"
import { errorResponse, ok } from "@/lib/http"
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/utils/pagination"
import { decodeMessagesQuery, decodeThreadParams } from "@/lib/validation/threads"

const threadOwners = new Map<string, string>()
const createdThreadId = "thr_owned"

const createThreadDeps: ThreadsPostDependencies = {
  requestIdFromRequest: () => "req_threads_owner",
  parseJsonBody: async () => ({ title: "Owned Thread" }),
  decodeCreateThreadRequest: (input) => input as { title?: string },
  getOrCreateSession: async () => ({ sessionKey: "session_a_key", sessionId: "session_a" }),
  clientIpFromRequest: () => "198.51.100.1",
  enforceRateLimit: async () => {},
  createThreadForSession: async (sessionId, title) => {
    threadOwners.set(createdThreadId, sessionId)
    return { id: createdThreadId, title: title ?? "Owned Thread", createdAt: "2026-02-25T00:00:00.000Z" }
  },
  ok,
  errorResponse
}

const assertOwnership = async (threadId: string, sessionId: string): Promise<void> => {
  if (threadOwners.get(threadId) !== sessionId) {
    throw new ForbiddenError("Thread does not belong to this session")
  }
}

const createChatDeps = (sessionId: string): ChatPostDependencies => ({
  requestIdFromRequest: () => "req_chat_owner",
  parseJsonBody: async () => ({ threadId: createdThreadId, question: "Who owns this thread?" }),
  decodeChatRequest: (input) => input as { threadId: string; question: string },
  getOrCreateSession: async () => ({ sessionKey: `${sessionId}_key`, sessionId }),
  assertThreadOwnership: assertOwnership,
  clientIpFromRequest: () => "198.51.100.2",
  enforceRateLimit: async () => {},
  answerQuestion: async () => ({
    userMessageId: "msg_user_1",
    assistantMessageId: "msg_assistant_1",
    answer: "Only owners can chat.",
    citations: [],
    retrievalMeta: { candidateCount: 1, selectedCount: 1 }
  }),
  ok,
  errorResponse
})

const createMessagesDeps = (sessionId: string): ThreadMessagesGetDependencies => ({
  requestIdFromRequest: () => "req_messages_owner",
  decodeThreadParams,
  decodeMessagesQuery,
  decodeMessageCursor,
  getOrCreateSession: async () => ({ sessionKey: `${sessionId}_key`, sessionId }),
  assertThreadOwnership: assertOwnership,
  listThreadMessages: async () => [],
  encodeMessageCursor,
  ok,
  errorResponse
})

test("session ownership is enforced consistently across chat and message routes", async () => {
  threadOwners.clear()

  const createThreadResponse = await createThreadsPostHandler(createThreadDeps)(
    new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Owned Thread" })
    })
  )

  expect(createThreadResponse.status).toBe(200)
  expect(threadOwners.get(createdThreadId)).toBe("session_a")

  const ownerChatResponse = await createChatPostHandler(createChatDeps("session_a"))(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: createdThreadId, question: "Allowed?" })
    })
  )
  expect(ownerChatResponse.status).toBe(200)

  const nonOwnerChatResponse = await createChatPostHandler(createChatDeps("session_b"))(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: createdThreadId, question: "Allowed?" })
    })
  )
  expect(nonOwnerChatResponse.status).toBe(403)
  expect(await nonOwnerChatResponse.json()).toEqual({
    error: { code: "forbidden", message: "Thread does not belong to this session" }
  })

  const nonOwnerMessagesResponse = await createThreadMessagesGetHandler(createMessagesDeps("session_b"))(
    new Request(`http://localhost/api/threads/${createdThreadId}/messages`),
    { params: Promise.resolve({ threadId: createdThreadId }) }
  )
  expect(nonOwnerMessagesResponse.status).toBe(403)
  expect(await nonOwnerMessagesResponse.json()).toEqual({
    error: { code: "forbidden", message: "Thread does not belong to this session" }
  })
})
