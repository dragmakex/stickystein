import { env } from "@/lib/env"
import { PaymentRequiredError, toAppError } from "@/lib/errors"
import { errorResponse, ok, parseJsonBody, requestIdFromRequest } from "@/lib/http"
import { BYPASS_USER_ID } from "@/lib/security/bypass"
import { clientIpFromRequest } from "@/lib/security/request"
import { decodeChatRequest } from "@/lib/validation/chat"
import { requireCurrentUser } from "@/server/auth"
import { consumeQueryCredit } from "@/server/repositories/chat-repo"
import { assertThreadOwnership } from "@/server/chat/threads"
import { answerQuestion } from "@/server/rag/answer-orchestrator"
import { enforceRateLimit } from "@/server/rate-limit/limiter"
import { routeKeys, subjectKey } from "@/server/rate-limit/keys"
import { Effect } from "effect"

export type ChatPostDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly parseJsonBody: typeof parseJsonBody
  readonly decodeChatRequest: typeof decodeChatRequest
  readonly requireCurrentUser: typeof requireCurrentUser
  readonly consumeQueryCredit: typeof consumeQueryCredit
  readonly assertThreadOwnership: typeof assertThreadOwnership
  readonly clientIpFromRequest: typeof clientIpFromRequest
  readonly enforceRateLimit: typeof enforceRateLimit
  readonly answerQuestion: typeof answerQuestion
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: ChatPostDependencies = {
  requestIdFromRequest,
  parseJsonBody,
  decodeChatRequest,
  requireCurrentUser,
  consumeQueryCredit,
  assertThreadOwnership,
  clientIpFromRequest,
  enforceRateLimit,
  answerQuestion,
  ok,
  errorResponse
}

const handleChatPost = Effect.fn("ChatRoute.POST")(function* (request: Request, requestId: string, deps: ChatPostDependencies) {
  const rawBody = yield* Effect.tryPromise({
    try: () => deps.parseJsonBody(request, { maxBytes: 16 * 1024 }),
    catch: toAppError
  })
  const body = yield* Effect.try({
    try: () => deps.decodeChatRequest(rawBody),
    catch: toAppError
  })
  const user = yield* Effect.tryPromise({
    try: () => deps.requireCurrentUser(),
    catch: toAppError
  })
  yield* Effect.tryPromise({
    try: () => deps.assertThreadOwnership(body.threadId, user.id),
    catch: toAppError
  })

  if (user.id !== BYPASS_USER_ID) {
    const remainingCredits = yield* Effect.tryPromise({
      try: () => deps.consumeQueryCredit(user.id),
      catch: toAppError
    })
    if (remainingCredits === null) {
      return yield* Effect.fail(new PaymentRequiredError("No queries remaining. Buy a $1 pack for 5 more queries."))
    }
  }

  yield* Effect.tryPromise({
    try: () =>
      deps.enforceRateLimit({
        subjectKey: subjectKey(deps.clientIpFromRequest(request), user.id),
        routeKey: routeKeys.chat,
        windowSec: env.rateLimit.chatWindowSec,
        max: env.rateLimit.chatMax
      }),
    catch: toAppError
  })

  const answer = yield* Effect.tryPromise({
    try: () => deps.answerQuestion(body.threadId, body.question),
    catch: toAppError
  })

  return deps.ok({ threadId: body.threadId, ...answer }, requestId)
})

export const createChatPostHandler =
  (deps: ChatPostDependencies = liveDependencies) =>
  async (request: Request) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleChatPost(request, requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const POST = createChatPostHandler()
