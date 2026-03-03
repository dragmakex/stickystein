import { expect, test } from "bun:test"

import { ExternalServiceError } from "@/lib/errors"
import { isTransientJobError, retryDelaySeconds, runWorkerIteration } from "@/server/jobs/worker"

test("isTransientJobError matches app and io/network transient failures", () => {
  expect(isTransientJobError(new ExternalServiceError("upstream timeout"))).toBe(true)
  expect(isTransientJobError({ code: "ETIMEDOUT" })).toBe(true)
  expect(isTransientJobError({ cause: { code: "ECONNRESET" } })).toBe(true)
  expect(isTransientJobError(new Error("nope"))).toBe(false)
})

test("retryDelaySeconds uses capped exponential backoff", () => {
  expect(retryDelaySeconds(1)).toBeGreaterThanOrEqual(1)
  expect(retryDelaySeconds(2)).toBeGreaterThanOrEqual(retryDelaySeconds(1))
  expect(retryDelaySeconds(8)).toBeLessThanOrEqual(60)
})

test("worker iteration retries transient failures before max attempts", async () => {
  let doneCalls = 0
  let failedCalls = 0
  const retryCalls: Array<{ jobId: string; delaySeconds: number; errorCode: string; errorMessage: string }> = []

  const result = await runWorkerIteration({
    claimNextIndexJob: async () => ({
      id: "job_1",
      jobType: "index_corpus",
      documentId: null,
      status: "running",
      progress: 10,
      attempts: 1,
      maxAttempts: 5
    }),
    indexCorpus: async () => {
      throw new ExternalServiceError("provider timeout")
    },
    markJobDone: async () => {
      doneCalls += 1
    },
    markJobFailed: async () => {
      failedCalls += 1
    },
    markJobRetrying: async (jobId, delaySeconds, errorCode, errorMessage) => {
      retryCalls.push({ jobId, delaySeconds, errorCode, errorMessage })
    },
    sleep: async () => {},
    logger: { info: () => {}, error: () => {} }
  })

  expect(result).toBe("processed")
  expect(doneCalls).toBe(0)
  expect(failedCalls).toBe(0)
  expect(retryCalls).toHaveLength(1)
  expect(retryCalls[0]?.jobId).toBe("job_1")
  expect(retryCalls[0]?.errorCode).toBe("external_service")
})

test("worker iteration marks failed for non-transient errors", async () => {
  let failedCalls = 0

  await runWorkerIteration({
    claimNextIndexJob: async () => ({
      id: "job_2",
      jobType: "index_corpus",
      documentId: null,
      status: "running",
      progress: 10,
      attempts: 1,
      maxAttempts: 5
    }),
    indexCorpus: async () => {
      throw new Error("bad pdf")
    },
    markJobDone: async () => {},
    markJobFailed: async (jobId, errorCode, errorMessage) => {
      failedCalls += 1
      expect(jobId).toBe("job_2")
      expect(errorCode).toBe("job_failed")
      expect(errorMessage).toBe("bad pdf")
    },
    markJobRetrying: async () => {
      throw new Error("should not retry")
    },
    sleep: async () => {},
    logger: { info: () => {}, error: () => {} }
  })

  expect(failedCalls).toBe(1)
})

test("worker iteration marks failed when attempts are exhausted", async () => {
  let failedCalls = 0

  await runWorkerIteration({
    claimNextIndexJob: async () => ({
      id: "job_3",
      jobType: "index_corpus",
      documentId: null,
      status: "running",
      progress: 10,
      attempts: 5,
      maxAttempts: 5
    }),
    indexCorpus: async () => {
      throw new ExternalServiceError("still failing")
    },
    markJobDone: async () => {},
    markJobFailed: async () => {
      failedCalls += 1
    },
    markJobRetrying: async () => {
      throw new Error("should not retry")
    },
    sleep: async () => {},
    logger: { info: () => {}, error: () => {} }
  })

  expect(failedCalls).toBe(1)
})

test("worker iteration idles and sleeps when no job is available", async () => {
  let sleptMs = 0

  const result = await runWorkerIteration({
    claimNextIndexJob: async () => null,
    indexCorpus: async () => {},
    markJobDone: async () => {
      throw new Error("should not mark done")
    },
    markJobFailed: async () => {
      throw new Error("should not mark failed")
    },
    markJobRetrying: async () => {
      throw new Error("should not retry")
    },
    sleep: async (ms) => {
      sleptMs = ms
    },
    logger: { info: () => {}, error: () => {} }
  })

  expect(result).toBe("idle")
  expect(sleptMs).toBe(1000)
})
