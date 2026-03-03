import { expect, test } from "bun:test"

import { parseJsonBody } from "@/lib/http"

test("parseJsonBody decodes valid json body", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "hello" })
  })

  const parsed = await parseJsonBody(request)
  expect(parsed).toEqual({ question: "hello" })
})

test("parseJsonBody enforces max body size", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "x".repeat(256) })
  })

  await expect(parseJsonBody(request, { maxBytes: 64 })).rejects.toThrow("too large")
})

test("parseJsonBody rejects non-json content types", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{\"hello\":true}"
  })

  await expect(parseJsonBody(request)).rejects.toThrow("Content-Type must be application/json")
})
