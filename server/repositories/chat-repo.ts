import { withDb } from "@/db/client"
import { makeId } from "@/lib/ids"

export type ChatMessageRow = {
  readonly id: string
  readonly role: "user" | "assistant" | "system"
  readonly content: string
  readonly citations: unknown
  readonly retrievalMeta: unknown
  readonly createdAt: string
}

export const ensureSession = async (sessionKey: string): Promise<string> => {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO chat_sessions (id, session_key)
      VALUES (${makeId("ses")}, ${sessionKey})
      ON CONFLICT (session_key) DO UPDATE SET updated_at = now()
      RETURNING id
    `
    return row.id
  })
}

export const createThread = async (sessionId: string, title: string): Promise<{ id: string; title: string; createdAt: string }> => {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string; title: string; createdAt: string }[]>`
      INSERT INTO chat_threads (id, session_id, title)
      VALUES (${makeId("thr")}, ${sessionId}, ${title})
      RETURNING id, title, created_at as "createdAt"
    `
    return row
  })
}

export const getThreadSessionId = async (threadId: string): Promise<string | null> => {
  return withDb(async (sql) => {
    const [row] = await sql<{ sessionId: string }[]>`
      SELECT session_id as "sessionId" FROM chat_threads WHERE id = ${threadId}
    `
    return row?.sessionId ?? null
  })
}

export const insertMessage = async (input: {
  threadId: string
  role: "user" | "assistant" | "system"
  content: string
  citations?: unknown
  retrievalMeta?: unknown
}): Promise<{ id: string; createdAt: string }> => {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string; createdAt: string }[]>`
      INSERT INTO chat_messages (id, thread_id, role, content, citations, retrieval_meta)
      VALUES (${makeId("msg")}, ${input.threadId}, ${input.role}, ${input.content}, ${input.citations ? sql.json(input.citations as never) : null}, ${input.retrievalMeta ? sql.json(input.retrievalMeta as never) : null})
      RETURNING id, created_at as "createdAt"
    `
    return row
  })
}

export const listMessages = async (threadId: string, limit: number): Promise<ReadonlyArray<ChatMessageRow>> => {
  return listMessagesAfterCursor(threadId, limit)
}

export const listMessagesAfterCursor = async (
  threadId: string,
  limit: number,
  cursor?: { createdAt: string; id: string }
): Promise<ReadonlyArray<ChatMessageRow>> => {
  return withDb(async (sql) => {
    if (cursor) {
      return sql<ChatMessageRow[]>`
        SELECT id, role, content, citations, retrieval_meta as "retrievalMeta", created_at as "createdAt"
        FROM chat_messages
        WHERE thread_id = ${threadId}
          AND (created_at, id) > (${cursor.createdAt}::timestamptz, ${cursor.id})
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit}
      `
    }

    return sql<ChatMessageRow[]>`
      SELECT id, role, content, citations, retrieval_meta as "retrievalMeta", created_at as "createdAt"
      FROM chat_messages
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC, id ASC
      LIMIT ${limit}
    `
  })
}
