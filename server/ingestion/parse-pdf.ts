import { execFile as execFileCallback } from "node:child_process"
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { PDFParse } from "pdf-parse"

import { normalizePageText } from "@/server/ingestion/normalize"

const execFile = promisify(execFileCallback)

const OCR_TEXT_THRESHOLD = 32

let ocrDependenciesAvailable: boolean | null = null

export type ParsedPage = {
  readonly pageNumber: number
  readonly text: string
  readonly warnings: ReadonlyArray<string>
}

export type ParsedPdf = {
  readonly pageCount: number
  readonly pages: ReadonlyArray<ParsedPage>
}

const hasOcrDependencies = async (): Promise<boolean> => {
  if (ocrDependenciesAvailable !== null) return ocrDependenciesAvailable

  try {
    await execFile("pdftoppm", ["-h"])
    await execFile("tesseract", ["--help"])
    ocrDependenciesAvailable = true
  } catch {
    ocrDependenciesAvailable = false
  }

  return ocrDependenciesAvailable
}

const ocrPdfPage = async (filePath: string, pageNumber: number): Promise<string> => {
  const workDir = await mkdtemp(path.join(tmpdir(), "stickystein-ocr-"))
  const outputPrefix = path.join(workDir, "page")
  const imagePath = `${outputPrefix}-1.png`

  try {
    await execFile("pdftoppm", ["-f", String(pageNumber), "-l", String(pageNumber), "-png", filePath, outputPrefix])
    const { stdout } = await execFile("tesseract", [imagePath, "stdout"])
    return normalizePageText(stdout)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

const shouldUseOcr = (text: string): boolean => text.length < OCR_TEXT_THRESHOLD

export const parsePdfByPage = async (filePath: string): Promise<ParsedPdf> => {
  const bytes = await readFile(filePath)
  const parser = new PDFParse({ data: bytes })
  const parsed = await parser.getText()
  const canUseOcr = await hasOcrDependencies()

  const pages = await Promise.all(
    parsed.pages.map(async (page) => {
      const normalizedText = normalizePageText(page.text)
      const warnings: string[] = normalizedText.length === 0 ? ["empty-page"] : []

      if (!canUseOcr || !shouldUseOcr(normalizedText)) {
        return {
          pageNumber: page.num,
          text: normalizedText,
          warnings
        }
      }

      try {
        const ocrText = await ocrPdfPage(filePath, page.num)
        if (ocrText.length > normalizedText.length) {
          return {
            pageNumber: page.num,
            text: ocrText,
            warnings: [...warnings, "ocr-fallback"]
          }
        }

        return {
          pageNumber: page.num,
          text: normalizedText,
          warnings: [...warnings, "ocr-no-improvement"]
        }
      } catch {
        return {
          pageNumber: page.num,
          text: normalizedText,
          warnings: [...warnings, "ocr-failed"]
        }
      }
    })
  )

  await parser.destroy()
  return { pageCount: parsed.total, pages }
}
