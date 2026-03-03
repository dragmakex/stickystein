import { env } from "@/lib/env"
import { ForbiddenError, toAppError } from "@/lib/errors"
import { errorResponse, ok, requestIdFromRequest } from "@/lib/http"
import { clientIpFromRequest } from "@/lib/security/request"
import { enqueueCorpusIndexJob } from "@/server/jobs/enqueue"
import { routeKeys, subjectKey } from "@/server/rate-limit/keys"
import { enforceRateLimit } from "@/server/rate-limit/limiter"
import { Effect } from "effect"

export type IndexRunPostDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly adminIngestToken: string
  readonly clientIpFromRequest: typeof clientIpFromRequest
  readonly enforceRateLimit: typeof enforceRateLimit
  readonly enqueueCorpusIndexJob: typeof enqueueCorpusIndexJob
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: IndexRunPostDependencies = {
  requestIdFromRequest,
  adminIngestToken: env.adminIngestToken,
  clientIpFromRequest,
  enforceRateLimit,
  enqueueCorpusIndexJob,
  ok,
  errorResponse
}

const handleIndexRunPost = Effect.fn("IndexRunRoute.POST")(function* (request: Request, requestId: string, deps: IndexRunPostDependencies) {
  const token = request.headers.get("x-admin-token")
  if (!deps.adminIngestToken || token !== deps.adminIngestToken) {
    return yield* Effect.fail(new ForbiddenError("Admin token is required"))
  }

  yield* Effect.tryPromise({
    try: () =>
      deps.enforceRateLimit({
        subjectKey: subjectKey(deps.clientIpFromRequest(request), "admin"),
        routeKey: routeKeys.indexRun,
        windowSec: env.rateLimit.indexWindowSec,
        max: env.rateLimit.indexMax
      }),
    catch: toAppError
  })

  const job = yield* Effect.tryPromise({
    try: () => deps.enqueueCorpusIndexJob(),
    catch: toAppError
  })
  return deps.ok({ jobId: job.id, status: job.status }, requestId)
})

export const createIndexRunPostHandler =
  (deps: IndexRunPostDependencies = liveDependencies) =>
  async (request: Request) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleIndexRunPost(request, requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const POST = createIndexRunPostHandler()
