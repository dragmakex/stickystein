import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { discoverLocalPdfs, normalizeDiscoveredPdfFilename } from "@/server/ingestion/discover"

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

test("normalizeDiscoveredPdfFilename prefers the VOL-prefixed suffix when present", () => {
  expect(normalizeDiscoveredPdfFilename(path.join("DataSet 2", "VOL00002", "IMAGES", "0001", "EFTA00003159.pdf"))).toBe(
    "VOL00002/IMAGES/0001/EFTA00003159.pdf"
  )
  expect(normalizeDiscoveredPdfFilename("VOL00011/IMAGES/0332/EFTA02730262.pdf")).toBe(
    "VOL00011/IMAGES/0332/EFTA02730262.pdf"
  )
  expect(normalizeDiscoveredPdfFilename("nested/file.pdf")).toBe("nested/file.pdf")
})

test("discoverLocalPdfs normalizes DataSet-wrapped volume paths to VOL-prefixed names", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "efiles-discover-"))
  createdDirs.push(root)

  await mkdir(path.join(root, "DataSet 12", "VOL00012", "IMAGES", "0001"), { recursive: true })
  await writeFile(path.join(root, "DataSet 12", "VOL00012", "IMAGES", "0001", "EFTA02730265.pdf"), "fake")

  const discovered = await discoverLocalPdfs(root)
  expect(discovered.map((item) => item.filename)).toEqual(["VOL00012/IMAGES/0001/EFTA02730265.pdf"])
})
