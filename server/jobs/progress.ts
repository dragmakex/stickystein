import { markJobProgress } from "@/server/jobs/transitions"

export const reportProgress = async (jobId: string, progress: number): Promise<void> => {
  await markJobProgress(jobId, Math.max(0, Math.min(100, progress)))
}
