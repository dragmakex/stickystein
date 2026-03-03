import { env } from "@/lib/env"
import { ForbiddenError, toAppError } from "@/lib/errors"
import { errorResponse, ok, requestIdFromRequest } from "@/lib/http"
import { clientIpFromRequest } from "@/lib/security/request"
import { decodeRetryJobParams } from "@/lib/validation/index"
import { retryIndexJob } from "@/server/jobs/transitions"
import { routeKeys, subjectKey } from "@/server/rate-limit/keys"
import { enforceRateLimit } from "@/server/rate-limit/limiter"
import { Effect } from "effect"

export type IndexRetryPostDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly adminIngestToken: string
  readonly clientIpFromRequest: typeof clientIpFromRequest
  readonly enforceRateLimit: typeof enforceRateLimit
  readonly decodeRetryJobParams: typeof decodeRetryJobParams
  readonly retryIndexJob: typeof retryIndexJob
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: IndexRetryPostDependencies = {
  requestIdFromRequest,
  adminIngestToken: env.adminIngestToken,
  clientIpFromRequest,
  enforceRateLimit,
  decodeRetryJobParams,
  retryIndexJob,
  ok,
  errorResponse
}

const handleIndexRetryPost = Effect.fn("IndexRetryRoute.POST")(function* (
  request: Request,
  context: { params: Promise<{ jobId: string }> },
  requestId: string,
  deps: IndexRetryPostDependencies
) {
  const token = request.headers.get("x-admin-token")
  if (!deps.adminIngestToken || token !== deps.adminIngestToken) {
    return yield* Effect.fail(new ForbiddenError("Admin token is required"))
  }

  yield* Effect.tryPromise({
    try: () =>
      deps.enforceRateLimit({
        subjectKey: subjectKey(deps.clientIpFromRequest(request), "admin"),
        routeKey: routeKeys.indexRetry,
        windowSec: env.rateLimit.indexWindowSec,
        max: env.rateLimit.indexMax
      }),
    catch: toAppError
  })

  const rawParams = yield* Effect.tryPromise({
    try: () => context.params,
    catch: toAppError
  })
  const params = yield* Effect.try({
    try: () => deps.decodeRetryJobParams(rawParams),
    catch: toAppError
  })
  yield* Effect.tryPromise({
    try: () => deps.retryIndexJob(params.jobId),
    catch: toAppError
  })
  return deps.ok({ jobId: params.jobId, status: "retrying" }, requestId)
})

export const createIndexRetryPostHandler =
  (deps: IndexRetryPostDependencies = liveDependencies) =>
  async (request: Request, context: { params: Promise<{ jobId: string }> }) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleIndexRetryPost(request, context, requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const POST = createIndexRetryPostHandler()
