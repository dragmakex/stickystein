import { cookies } from "next/headers"

import { makeId } from "@/lib/ids"
import { decodeSessionCookie, encodeSessionCookie, sessionCookieOptions } from "@/lib/security/cookies"
import { env } from "@/lib/env"
import { ensureSession } from "@/server/repositories/chat-repo"

const SESSION_COOKIE_NAME = "efiles_session"

export const getOrCreateSession = async (): Promise<{ sessionKey: string; sessionId: string }> => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const existing = decodeSessionCookie(raw, env.sessionSecret)
  const sessionKey = existing ?? makeId("session")

  const sessionId = await ensureSession(sessionKey)

  if (!existing) {
    cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(sessionKey, env.sessionSecret), {
      ...sessionCookieOptions,
      maxAge: 60 * 60 * 24 * 30
    })
  }

  return { sessionKey, sessionId }
}
