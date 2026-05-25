import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

import { env } from "@/lib/env"

export const BYPASS_COOKIE_NAME = "stickystein_bypass"
export const BYPASS_USER_ID = "bypass_user"
const BYPASS_TTL_MS = 1000 * 60 * 60 * 24 * 30

const sign = (expiresAt: number): string => createHmac("sha256", env.auth.secret).update(`bypass:${expiresAt}`).digest("hex")

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const verifyBypassSecret = (secret: string): boolean => {
  const expectedSecret = env.chatBypassSecret.trim()
  const providedSecret = secret.trim()
  if (!expectedSecret || !providedSecret) return false
  return safeEqual(providedSecret, expectedSecret)
}

export const createBypassCookieValue = (now = Date.now()): string => {
  const expiresAt = now + BYPASS_TTL_MS
  return `${expiresAt}.${sign(expiresAt)}`
}

export const isValidBypassCookieValue = (value: string | undefined, now = Date.now()): boolean => {
  if (!value) return false
  const [expiresAtRaw, signature] = value.split(".")
  if (!expiresAtRaw || !signature) return false

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false

  return safeEqual(signature, sign(expiresAt))
}

export const hasBypassAccess = async (): Promise<boolean> => {
  const cookieStore = await cookies()
  return isValidBypassCookieValue(cookieStore.get(BYPASS_COOKIE_NAME)?.value)
}

export const bypassCookieMaxAge = Math.floor(BYPASS_TTL_MS / 1000)
