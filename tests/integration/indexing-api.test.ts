import { expect, test } from "bun:test"

import { createIndexDocumentsGetHandler, type IndexDocumentsGetDependencies } from "@/app/api/index/documents/route"
import { createIndexRetryPostHandler, type IndexRetryPostDependencies } from "@/app/api/index/retry/[jobId]/route"
import { createIndexRunPostHandler, type IndexRunPostDependencies } from "@/app/api/index/run/route"
import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/errors"
import { errorResponse, ok } from "@/lib/http"

const makeRunDeps = (overrides: Partial<IndexRunPostDependencies> = {}): IndexRunPostDependencies => ({
  requestIdFromRequest: () => "req_index_run",
  adminIngestToken: "admin-secret",
  clientIpFromRequest: () => "203.0.113.2",
  enforceRateLimit: async () => {},
  enqueueCorpusIndexJob: async () => ({
    id: "job_1",
    jobType: "index_corpus" as const,
    status: "queued" as const,
    documentId: null,
    attempts: 0,
    maxAttempts: 5,
    progress: 0
  }),
  ok,
  errorResponse,
  ...overrides
})

const makeRetryDeps = (overrides: Partial<IndexRetryPostDependencies> = {}): IndexRetryPostDependencies => ({
  requestIdFromRequest: () => "req_index_retry",
  adminIngestToken: "admin-secret",
  clientIpFromRequest: () => "203.0.113.2",
  enforceRateLimit: async () => {},
  decodeRetryJobParams: (input) => input as { jobId: string },
  retryIndexJob: async () => {},
  ok,
  errorResponse,
  ...overrides
})

const makeDocumentsDeps = (overrides: Partial<IndexDocumentsGetDependencies> = {}): IndexDocumentsGetDependencies => ({
  requestIdFromRequest: () => "req_docs",
  listDocumentsWithLatestJob: async () => [
    {
      documentId: "doc_1",
      filename: "file.pdf",
      status: "ready",
      pageCount: 12,
      lastIndexedAt: "2026-02-25T00:00:00.000Z",
      jobId: "job_1",
      jobStatus: "done",
      jobProgress: 100
    }
  ],
  ok,
  errorResponse,
  ...overrides
})

test("index run api validates admin token and enqueues job", async () => {
  const captured: Array<{ subjectKey: string; routeKey: string; windowSec: number; max: number }> = []
  const response = await createIndexRunPostHandler(
    makeRunDeps({
      enforceRateLimit: async (input) => {
        captured.push(input)
      }
    })
  )(
    new Request("http://localhost/api/index/run", {
      method: "POST",
      headers: { "x-admin-token": "admin-secret", "x-request-id": "req_incoming" }
    })
  )

  expect(response.status).toBe(200)
  expect(response.headers.get("x-request-id")).toBe("req_index_run")
  expect(captured).toEqual([{ subjectKey: "203.0.113.2:admin", routeKey: "index-run", windowSec: 60, max: 3 }])
  expect(await response.json()).toEqual({ jobId: "job_1", status: "queued" })
})

test("index run api rejects missing admin token", async () => {
  const response = await createIndexRunPostHandler(makeRunDeps())(
    new Request("http://localhost/api/index/run", {
      method: "POST"
    })
  )

  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    error: { code: "forbidden", message: "Admin token is required" }
  })
})

test("index run api surfaces rate limit errors", async () => {
  const response = await createIndexRunPostHandler(
    makeRunDeps({
      enforceRateLimit: async () => {
        throw new RateLimitError("Slow down")
      }
    })
  )(
    new Request("http://localhost/api/index/run", {
      method: "POST",
      headers: { "x-admin-token": "admin-secret" }
    })
  )

  expect(response.status).toBe(429)
  expect(await response.json()).toEqual({
    error: { code: "rate_limited", message: "Slow down" }
  })
})

test("index retry api validates params and requests retry", async () => {
  const retried: string[] = []
  const response = await createIndexRetryPostHandler(
    makeRetryDeps({
      retryIndexJob: async (jobId) => {
        retried.push(jobId)
      }
    })
  )(
    new Request("http://localhost/api/index/retry/job_2", {
      method: "POST",
      headers: { "x-admin-token": "admin-secret" }
    }),
    { params: Promise.resolve({ jobId: "job_2" }) }
  )

  expect(response.status).toBe(200)
  expect(retried).toEqual(["job_2"])
  expect(await response.json()).toEqual({ jobId: "job_2", status: "retrying" })
})

test("index retry api returns validation error for malformed params", async () => {
  const response = await createIndexRetryPostHandler(
    makeRetryDeps({
      decodeRetryJobParams: () => {
        throw new ValidationError("Invalid retry job params")
      }
    })
  )(
    new Request("http://localhost/api/index/retry/bad", {
      method: "POST",
      headers: { "x-admin-token": "admin-secret" }
    }),
    { params: Promise.resolve({ jobId: "" }) }
  )

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: { code: "validation_error", message: "Invalid retry job params" }
  })
})

test("index documents api returns mapped rows", async () => {
  const response = await createIndexDocumentsGetHandler(makeDocumentsDeps())(new Request("http://localhost/api/index/documents"))

  expect(response.status).toBe(200)
  expect(response.headers.get("x-request-id")).toBe("req_docs")
  expect(await response.json()).toEqual({
    documents: [
      {
        documentId: "doc_1",
        filename: "file.pdf",
        status: "ready",
        pageCount: 12,
        lastIndexedAt: "2026-02-25T00:00:00.000Z",
        latestJob: {
          jobId: "job_1",
          status: "done",
          progress: 100
        }
      }
    ]
  })
})

test("index documents api uses standardized error response", async () => {
  const response = await createIndexDocumentsGetHandler(
    makeDocumentsDeps({
      listDocumentsWithLatestJob: async () => {
        throw new ForbiddenError("No access")
      }
    })
  )(new Request("http://localhost/api/index/documents"))

  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({
    error: { code: "forbidden", message: "No access" }
  })
})
