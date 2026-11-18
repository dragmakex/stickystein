import { env } from "@/lib/env"
import { discoverLocalPdfs } from "@/server/ingestion/discover"
import { indexDocument } from "@/server/ingestion/index-document"
import { reportProgress } from "@/server/jobs/progress"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isProviderUnavailable = (error: unknown): boolean => {
  const detail = (error as { detail?: { status?: unknown; body?: unknown } })?.detail
  const status = typeof detail?.status === "number" ? detail.status : 0
  const body = typeof detail?.body === "string" ? detail.body : ""
  return (
    status === 502 ||
    status === 503 ||
    status === 429 ||
    /rate limit|too many requests/i.test(body) ||
    /no_upstream_keys|no eligible swissai keys|upstream unavailable/i.test(body)
  )
}

export const indexCorpus = async (jobId?: string): Promise<void> => {
  const documents = await discoverLocalPdfs(env.pdfDataDir)
  console.log(`[index] Found ${documents.length} PDFs under ${env.pdfDataDir}`)
  if (documents.length > 0) console.log(`[index] First source: ${documents[0].filename}`)
  if (documents.length === 0) {
    if (jobId) await reportProgress(jobId, 100)
    return
  }

  for (let index = 0; index < documents.length; index += 1) {
    let attempt = 0
    for (;;) {
      try {
        await indexDocument(documents[index])
        break
      } catch (error) {
        if (isProviderUnavailable(error)) {
          attempt += 1
          const waitMs = Math.min(30_000 * 2 ** Math.min(attempt - 1, 4), 300_000)
          console.error(
            `[index] Embedding provider unavailable on ${documents[index].filename}; ` +
              `retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt})`
          )
          await sleep(waitMs)
          continue
        }

        console.error(`[index] Failed on ${documents[index].filename}; continuing`, error)
        break
      }
    }

    if ((index + 1) % 100 === 0 || index + 1 === documents.length) {
      console.log(`[index] Checked ${index + 1}/${documents.length} PDFs; last: ${documents[index].filename}`)
    }

    if (jobId) {
      const progress = Math.round(((index + 1) / documents.length) * 100)
      await reportProgress(jobId, progress)
    }
  }
}
