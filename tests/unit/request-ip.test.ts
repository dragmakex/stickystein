import { expect, test } from "bun:test"

import { clientIpFromRequest } from "@/lib/security/request"

test("clientIpFromRequest uses first x-forwarded-for entry", () => {
  const request = new Request("http://localhost/api/chat", {
    headers: {
      "x-forwarded-for": "203.0.113.1, 10.0.0.5"
    }
  })

  expect(clientIpFromRequest(request)).toBe("203.0.113.1")
})

test("clientIpFromRequest falls back to local for invalid values", () => {
  const request = new Request("http://localhost/api/chat", {
    headers: {
      "x-forwarded-for": "javascript:alert(1)"
    }
  })

  expect(clientIpFromRequest(request)).toBe("local")
})
