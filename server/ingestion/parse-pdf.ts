import { execFile as execFileCallback } from "node:child_process"
import { access, readFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { PDFParse } from "pdf-parse"

import { env } from "@/lib/env"
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

const preprocessPdf = async (
  filePath: string
): Promise<{ readonly filePath: string; readonly warnings: ReadonlyArray<string>; readonly cleanup: () => Promise<void> }> => {
  if (!env.pdfPreprocessCommand) {
    return {
      filePath,
      warnings: [],
      cleanup: async () => {}
    }
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "stickystein-preprocess-"))
  const outputPath = path.join(workDir, "preprocessed.pdf")

  try {
    await execFile("sh", ["-c", env.pdfPreprocessCommand], {
      env: {
        ...process.env,
        INPUT_FILE: filePath,
        OUTPUT_FILE: outputPath
      }
    })
    await access(outputPath)

    return {
      filePath: outputPath,
      warnings: ["pdf-preprocessed"],
      cleanup: async () => {
        await rm(workDir, { recursive: true, force: true })
      }
    }
  } catch {
    await rm(workDir, { recursive: true, force: true })
    return {
      filePath,
      warnings: ["pdf-preprocess-failed"],
      cleanup: async () => {}
    }
  }
}

export const parsePdfByPage = async (filePath: string): Promise<ParsedPdf> => {
  const prepared = await preprocessPdf(filePath)
  const bytes = await readFile(prepared.filePath)
  const parser = new PDFParse({ data: bytes })

  try {
    const parsed = await parser.getText()
    const canUseOcr = await hasOcrDependencies()

    const pages = await Promise.all(
      parsed.pages.map(async (page) => {
        const normalizedText = normalizePageText(page.text)
        const warnings: string[] = normalizedText.length === 0 ? ["empty-page"] : []
        warnings.push(...prepared.warnings)

        if (!canUseOcr || !shouldUseOcr(normalizedText)) {
          return {
            pageNumber: page.num,
            text: normalizedText,
            warnings
          }
        }

        try {
          const ocrText = await ocrPdfPage(prepared.filePath, page.num)
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

    return { pageCount: parsed.total, pages }
  } finally {
    await parser.destroy()
    await prepared.cleanup()
  }
}
