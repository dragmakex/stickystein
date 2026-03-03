import { createHmac, timingSafeEqual } from "node:crypto"

type SessionCookie = {
  readonly sessionId: string
  readonly signature: string
}

const splitCookie = (cookie: string): SessionCookie | null => {
  const [sessionId, signature] = cookie.split(".")
  if (!sessionId || !signature) return null
  return { sessionId, signature }
}

const sign = (sessionId: string, secret: string): string => createHmac("sha256", secret).update(sessionId).digest("hex")

export const encodeSessionCookie = (sessionId: string, secret: string): string => `${sessionId}.${sign(sessionId, secret)}`

export const decodeSessionCookie = (cookie: string | undefined, secret: string): string | null => {
  if (!cookie) return null
  const parsed = splitCookie(cookie)
  if (!parsed) return null
  const expected = sign(parsed.sessionId, secret)
  const left = Buffer.from(parsed.signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return null
  if (!timingSafeEqual(left, right)) return null
  return parsed.sessionId
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
}
