import { createHmac } from "node:crypto"
import { expect, test } from "bun:test"

import { env } from "@/lib/env"
import { createBypassCookieValue, isValidBypassCookieValue, verifyBypassSecret } from "@/lib/security/bypass"

test("changing the bypass secret invalidates cookies signed before rotation", () => {
  const now = Date.now()
  const expiresAt = now + 60_000
  const oldSignature = createHmac("sha256", env.auth.secret).update(`bypass:${expiresAt}`).digest("hex")

  expect(isValidBypassCookieValue(`${expiresAt}.${oldSignature}`, now)).toBe(false)
  if (env.chatBypassSecret) {
    expect(isValidBypassCookieValue(createBypassCookieValue(now), now)).toBe(true)
    expect(verifyBypassSecret(env.chatBypassSecret)).toBe(true)
  }
})
