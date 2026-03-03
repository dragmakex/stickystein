import { completeJob, failJob, rescheduleRunningJob, retryJob, updateJobProgress } from "@/server/repositories/jobs-repo"

export const markJobProgress = updateJobProgress
export const markJobDone = completeJob
export const markJobFailed = failJob
export const markJobRetrying = rescheduleRunningJob
export const retryIndexJob = retryJob
