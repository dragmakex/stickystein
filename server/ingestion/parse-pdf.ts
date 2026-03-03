import { readFile } from "node:fs/promises"

import { PDFParse } from "pdf-parse"

import { normalizePageText } from "@/server/ingestion/normalize"

export type ParsedPage = {
  readonly pageNumber: number
  readonly text: string
  readonly warnings: ReadonlyArray<string>
}

export type ParsedPdf = {
  readonly pageCount: number
  readonly pages: ReadonlyArray<ParsedPage>
}

export const parsePdfByPage = async (filePath: string): Promise<ParsedPdf> => {
  const bytes = await readFile(filePath)
  const parser = new PDFParse({ data: bytes })
  const parsed = await parser.getText()

  const pages = parsed.pages.map((page) => ({
    pageNumber: page.num,
    text: normalizePageText(page.text),
    warnings: page.text.trim().length === 0 ? ["empty-page"] : []
  }))

  await parser.destroy()
  return { pageCount: parsed.total, pages }
}
