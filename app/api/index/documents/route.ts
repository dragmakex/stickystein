import { toAppError } from "@/lib/errors"
import { errorResponse, ok, requestIdFromRequest } from "@/lib/http"
import { listDocumentsWithLatestJob } from "@/server/repositories/documents-repo"
import { Effect } from "effect"

export type IndexDocumentsGetDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly listDocumentsWithLatestJob: typeof listDocumentsWithLatestJob
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: IndexDocumentsGetDependencies = {
  requestIdFromRequest,
  listDocumentsWithLatestJob,
  ok,
  errorResponse
}

const handleIndexDocumentsGet = Effect.fn("IndexDocumentsRoute.GET")(function* (requestId: string, deps: IndexDocumentsGetDependencies) {
  const rows = yield* Effect.tryPromise({
    try: () => deps.listDocumentsWithLatestJob(),
    catch: toAppError
  })

  const documents = rows.map((row) => ({
    documentId: row.documentId,
    filename: row.filename,
    status: row.status,
    pageCount: row.pageCount,
    lastIndexedAt: row.lastIndexedAt,
    latestJob: row.jobId
      ? {
          jobId: row.jobId,
          status: row.jobStatus,
          progress: row.jobProgress
        }
      : null
  }))

  return deps.ok({ documents }, requestId)
})

export const createIndexDocumentsGetHandler =
  (deps: IndexDocumentsGetDependencies = liveDependencies) =>
  async (request: Request) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleIndexDocumentsGet(requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const GET = createIndexDocumentsGetHandler()
