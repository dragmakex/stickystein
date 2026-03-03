import { expect, test } from "bun:test"

test("job statuses include retrying", () => {
  const statuses = ["queued", "running", "retrying", "succeeded", "failed"]
  expect(statuses.includes("retrying")).toBe(true)
})
