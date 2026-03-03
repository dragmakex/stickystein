import { enqueueJob } from "@/server/repositories/jobs-repo"

export const enqueueCorpusIndexJob = async () => enqueueJob({ jobType: "index_corpus" })
