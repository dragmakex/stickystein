import { ForbiddenError } from "@/lib/errors"
import { createThread, getThreadSessionId } from "@/server/repositories/chat-repo"

export const createThreadForSession = async (sessionId: string, title?: string) => {
  return createThread(sessionId, title?.trim() || "New Thread")
}

export const assertThreadOwnership = async (threadId: string, sessionId: string): Promise<void> => {
  const ownerSessionId = await getThreadSessionId(threadId)
  if (!ownerSessionId || ownerSessionId !== sessionId) {
    throw new ForbiddenError("Thread does not belong to this session")
  }
}
