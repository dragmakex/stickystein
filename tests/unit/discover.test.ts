import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { discoverLocalPdfs } from "@/server/ingestion/discover"

const createdDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true })
    })
  )
})

test("discoverLocalPdfs scans nested directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "efiles-discover-"))
  createdDirs.push(root)

  await mkdir(path.join(root, "nested", "deeper"), { recursive: true })
  await writeFile(path.join(root, "a.pdf"), "fake")
  await writeFile(path.join(root, "nested", "b.PDF"), "fake")
  await writeFile(path.join(root, "nested", "deeper", "c.txt"), "ignore")

  const discovered = await discoverLocalPdfs(root)
  expect(discovered.map((item) => item.filename)).toEqual(["a.pdf", path.join("nested", "b.PDF")])
})
