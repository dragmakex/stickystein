import { env } from "@/lib/env"
import { discoverLocalPdfs } from "@/server/ingestion/discover"
import { indexDocument } from "@/server/ingestion/index-document"
import { reportProgress } from "@/server/jobs/progress"

export const indexCorpus = async (jobId?: string): Promise<void> => {
  const documents = await discoverLocalPdfs(env.pdfDataDir)
  console.log(`[index] Found ${documents.length} PDFs under ${env.pdfDataDir}`)
  if (documents.length > 0) console.log(`[index] First source: ${documents[0].filename}`)
  if (documents.length === 0) {
    if (jobId) await reportProgress(jobId, 100)
    return
  }

  for (let index = 0; index < documents.length; index += 1) {
    try {
      await indexDocument(documents[index])
    } catch (error) {
      console.error(`[index] Failed on ${documents[index].filename}`, error)
      throw error
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
