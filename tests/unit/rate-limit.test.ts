import { expect, test } from "bun:test"

import { subjectKey } from "@/server/rate-limit/keys"

test("subject key combines ip and session", () => {
  expect(subjectKey("127.0.0.1", "ses_1")).toBe("127.0.0.1:ses_1")
})
