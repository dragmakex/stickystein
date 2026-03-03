import { env } from "@/lib/env"
import { toAppError } from "@/lib/errors"
import { errorResponse, ok, parseJsonBody, requestIdFromRequest } from "@/lib/http"
import { clientIpFromRequest } from "@/lib/security/request"
import { decodeCreateThreadRequest } from "@/lib/validation/threads"
import { getOrCreateSession } from "@/server/chat/sessions"
import { createThreadForSession } from "@/server/chat/threads"
import { enforceRateLimit } from "@/server/rate-limit/limiter"
import { routeKeys, subjectKey } from "@/server/rate-limit/keys"
import { Effect } from "effect"

export type ThreadsPostDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly parseJsonBody: typeof parseJsonBody
  readonly decodeCreateThreadRequest: typeof decodeCreateThreadRequest
  readonly getOrCreateSession: typeof getOrCreateSession
  readonly clientIpFromRequest: typeof clientIpFromRequest
  readonly enforceRateLimit: typeof enforceRateLimit
  readonly createThreadForSession: typeof createThreadForSession
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: ThreadsPostDependencies = {
  requestIdFromRequest,
  parseJsonBody,
  decodeCreateThreadRequest,
  getOrCreateSession,
  clientIpFromRequest,
  enforceRateLimit,
  createThreadForSession,
  ok,
  errorResponse
}

const handleThreadsPost = Effect.fn("ThreadsRoute.POST")(function* (request: Request, requestId: string, deps: ThreadsPostDependencies) {
  const rawBody = yield* Effect.tryPromise({
    try: () => deps.parseJsonBody(request, { maxBytes: 8 * 1024, allowEmpty: true }),
    catch: toAppError
  })
  const body = yield* Effect.try({
    try: () => deps.decodeCreateThreadRequest(rawBody),
    catch: toAppError
  })
  const session = yield* Effect.tryPromise({
    try: () => deps.getOrCreateSession(),
    catch: toAppError
  })

  yield* Effect.tryPromise({
    try: () =>
      deps.enforceRateLimit({
        subjectKey: subjectKey(deps.clientIpFromRequest(request), session.sessionId),
        routeKey: routeKeys.createThread,
        windowSec: env.rateLimit.threadsWindowSec,
        max: env.rateLimit.threadsMax
      }),
    catch: toAppError
  })

  const thread = yield* Effect.tryPromise({
    try: () => deps.createThreadForSession(session.sessionId, body.title),
    catch: toAppError
  })

  return deps.ok({ threadId: thread.id, title: thread.title, createdAt: thread.createdAt }, requestId)
})

export const createThreadsPostHandler =
  (deps: ThreadsPostDependencies = liveDependencies) =>
  async (request: Request) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleThreadsPost(request, requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const POST = createThreadsPostHandler()
