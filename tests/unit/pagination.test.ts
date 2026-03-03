import { expect, test } from "bun:test"

import { decodeMessageCursor, encodeMessageCursor } from "@/lib/utils/pagination"

test("message cursor round trips", () => {
  const encoded = encodeMessageCursor({ createdAt: "2026-02-25T10:00:00.000Z", id: "msg_123" })
  const decoded = decodeMessageCursor(encoded)
  expect(decoded).toEqual({ createdAt: "2026-02-25T10:00:00.000Z", id: "msg_123" })
})

test("decodeMessageCursor returns null for invalid cursor", () => {
  expect(decodeMessageCursor("not-base64")).toBeNull()
})
