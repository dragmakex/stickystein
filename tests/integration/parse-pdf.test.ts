import { readdir } from "node:fs/promises"
import path from "node:path"

import { expect, test } from "bun:test"

import { parsePdfByPage } from "@/server/ingestion/parse-pdf"

const findFirstPdf = async (rootDir: string): Promise<string | null> => {
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.name.toLowerCase().endsWith(".pdf")) return fullPath
    }
  }

  return null
}

test("parsePdfByPage extracts page metadata from corpus PDFs", async () => {
  const pdfPath = await findFirstPdf(path.join(process.cwd(), "data"))
  expect(pdfPath).not.toBeNull()
  if (!pdfPath) throw new Error("Expected at least one PDF in data/")

  const parsed = await parsePdfByPage(pdfPath)
  expect(pdfPath.endsWith(".pdf")).toBe(true)
  expect(parsed.pageCount).toBeGreaterThan(0)
  expect(parsed.pages.length).toBe(parsed.pageCount)

  const firstPage = parsed.pages[0]
  expect(firstPage.pageNumber).toBeGreaterThan(0)
  expect(typeof firstPage.text).toBe("string")
  expect(Array.isArray(firstPage.warnings)).toBe(true)
}, 30000)
