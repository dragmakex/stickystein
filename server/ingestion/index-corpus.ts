import { discoverLocalPdfs } from "@/server/ingestion/discover"
import { indexDocument } from "@/server/ingestion/index-document"
import { reportProgress } from "@/server/jobs/progress"

export const indexCorpus = async (jobId?: string): Promise<void> => {
  const documents = await discoverLocalPdfs()
  if (documents.length === 0) {
    if (jobId) await reportProgress(jobId, 100)
    return
  }

  for (let index = 0; index < documents.length; index += 1) {
    await indexDocument(documents[index])
    if (jobId) {
      const progress = Math.round(((index + 1) / documents.length) * 100)
      await reportProgress(jobId, progress)
    }
  }
}
