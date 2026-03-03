import { listMessagesAfterCursor } from "@/server/repositories/chat-repo"

export const listThreadMessages = async (
  threadId: string,
  limit = 50,
  cursor?: { createdAt: string; id: string }
) => listMessagesAfterCursor(threadId, limit, cursor)
