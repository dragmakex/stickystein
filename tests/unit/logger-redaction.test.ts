import { expect, test } from "bun:test"

import { logger } from "@/lib/logger"

test("logger redacts nested sensitive fields", () => {
  const lines: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""))
  }

  try {
    logger.info("redaction test", {
      apiKey: "abc123",
      nested: {
        sessionToken: "session-secret",
        profile: { password: "pw", safe: "ok" }
      },
      list: [{ authHeader: "Bearer secret" }, { plain: "visible" }]
    })
  } finally {
    console.log = originalLog
  }

  const payload = JSON.parse(lines[0]) as {
    meta: {
      apiKey: string
      nested: { sessionToken: string; profile: { password: string; safe: string } }
      list: Array<{ authHeader?: string; plain?: string }>
    }
  }

  expect(payload.meta.apiKey).toBe("[REDACTED]")
  expect(payload.meta.nested.sessionToken).toBe("[REDACTED]")
  expect(payload.meta.nested.profile.password).toBe("[REDACTED]")
  expect(payload.meta.nested.profile.safe).toBe("ok")
  expect(payload.meta.list[0].authHeader).toBe("[REDACTED]")
  expect(payload.meta.list[1].plain).toBe("visible")
})
