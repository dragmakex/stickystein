import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { indexCorpus } from "@/server/ingestion/index-corpus"
import { claimNextIndexJob } from "@/server/jobs/claim-next-job"
import { markJobDone, markJobFailed, markJobRetrying } from "@/server/jobs/transitions"

type ClaimedJob = {
  readonly id: string
  readonly jobType: "index_document" | "index_corpus"
  readonly attempts: number
  readonly maxAttempts: number
}

type WorkerDependencies = {
  readonly claimNextIndexJob: typeof claimNextIndexJob
  readonly indexCorpus: typeof indexCorpus
  readonly markJobDone: typeof markJobDone
  readonly markJobFailed: typeof markJobFailed
  readonly markJobRetrying: typeof markJobRetrying
  readonly sleep: (ms: number) => Promise<void>
  readonly logger: Pick<typeof logger, "info" | "error">
}

const transientErrorCodes = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ECONNABORTED",
  "EPIPE"
])

const transientAppErrorCodes = new Set(["external_service", "database"])

const defaultDependencies: WorkerDependencies = {
  claimNextIndexJob,
  indexCorpus,
  markJobDone,
  markJobFailed,
  markJobRetrying,
  sleep: Bun.sleep,
  logger
}

const asErrorCode = (value: unknown): string | undefined => (typeof value === "string" && value.trim().length > 0 ? value : undefined)

export const isTransientJobError = (error: unknown): boolean => {
  if (error instanceof AppError && transientAppErrorCodes.has(error.code)) {
    return true
  }

  if (typeof error === "object" && error !== null) {
    const withCode = error as { readonly code?: unknown; readonly cause?: unknown }
    const code = asErrorCode(withCode.code)
    if (code && transientErrorCodes.has(code)) {
      return true
    }

    const causeCode = asErrorCode((withCode.cause as { readonly code?: unknown } | undefined)?.code)
    if (causeCode && transientErrorCodes.has(causeCode)) {
      return true
    }
  }

  return false
}

export const retryDelaySeconds = (attempts: number): number => {
  const baseMs = Math.max(1000, env.worker.retryBaseMs)
  const maxMs = Math.max(baseMs, env.worker.retryMaxMs)
  const exponent = Math.max(0, attempts - 1)
  const delayMs = Math.min(baseMs * Math.pow(2, exponent), maxMs)
  return Math.ceil(delayMs / 1000)
}

const handleFailedJob = async (job: ClaimedJob, error: unknown, deps: WorkerDependencies): Promise<void> => {
  const code = error instanceof AppError ? error.code : "job_failed"
  const message = error instanceof Error ? error.message : "Indexing job failed"

  if (isTransientJobError(error) && job.attempts < job.maxAttempts) {
    const retryInSeconds = retryDelaySeconds(job.attempts)
    deps.logger.info("job failed with transient error; scheduling retry", { jobId: job.id, attempts: job.attempts, retryInSeconds, error })
    await deps.markJobRetrying(job.id, retryInSeconds, code, message)
    return
  }

  await deps.markJobFailed(job.id, code, message)
}

export const runWorkerIteration = async (deps: WorkerDependencies = defaultDependencies): Promise<"idle" | "processed"> => {
  const job = await deps.claimNextIndexJob()
  if (!job) {
    await deps.sleep(env.worker.pollMs)
    return "idle"
  }

  deps.logger.info("processing job", { jobId: job.id, type: job.jobType })

  try {
    if (job.jobType === "index_corpus") {
      await deps.indexCorpus(job.id)
    }
    await deps.markJobDone(job.id)
  } catch (error) {
    deps.logger.error("job failed", { jobId: job.id, error })
    await handleFailedJob(job, error, deps)
  }

  return "processed"
}

export const runWorker = async (): Promise<void> => {
  while (true) {
    await runWorkerIteration(defaultDependencies)
  }
}
