import { toAppError } from "@/lib/errors"
import { errorResponse, ok, requestIdFromRequest } from "@/lib/http"
import { countDocuments, listDocumentsWithLatestJob } from "@/server/repositories/documents-repo"
import { Effect } from "effect"

export type IndexDocumentsGetDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly listDocumentsWithLatestJob: typeof listDocumentsWithLatestJob
  readonly countDocuments: typeof countDocuments
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: IndexDocumentsGetDependencies = {
  requestIdFromRequest,
  listDocumentsWithLatestJob,
  countDocuments,
  ok,
  errorResponse
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const handleIndexDocumentsGet = Effect.fn("IndexDocumentsRoute.GET")(function* (
  requestId: string,
  deps: IndexDocumentsGetDependencies,
  pagination: { readonly page: number; readonly pageSize: number; readonly includeTotal: boolean }
) {
  const offset = (pagination.page - 1) * pagination.pageSize
  const [rows, totalCount] = yield* Effect.tryPromise({
    try: () =>
      Promise.all([
        deps.listDocumentsWithLatestJob({ limit: pagination.pageSize, offset }),
        pagination.includeTotal ? deps.countDocuments() : Promise.resolve(null)
      ]),
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

  return deps.ok(
    {
      documents,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages: totalCount === null ? null : Math.max(1, Math.ceil(totalCount / pagination.pageSize))
      }
    },
    requestId
  )
})

export const createIndexDocumentsGetHandler =
  (deps: IndexDocumentsGetDependencies = liveDependencies) =>
  async (request: Request) => {
    const requestId = deps.requestIdFromRequest(request)
    const url = new URL(request.url)
    const page = parsePositiveInt(url.searchParams.get("page"), 1)
    const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const includeTotal = url.searchParams.get("includeTotal") !== "false"
    return Effect.runPromise(
      handleIndexDocumentsGet(requestId, deps, { page, pageSize, includeTotal }).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const GET = createIndexDocumentsGetHandler()
