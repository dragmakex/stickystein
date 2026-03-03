import { errorResponse, ok, requestIdFromRequest } from "@/lib/http"
import { ValidationError, toAppError } from "@/lib/errors"
import { decodeMessageCursor, encodeMessageCursor } from "@/lib/utils/pagination"
import { decodeMessagesQuery, decodeThreadParams } from "@/lib/validation/threads"
import { getOrCreateSession } from "@/server/chat/sessions"
import { listThreadMessages } from "@/server/chat/messages"
import { assertThreadOwnership } from "@/server/chat/threads"
import { Effect } from "effect"

export type ThreadMessagesGetDependencies = {
  readonly requestIdFromRequest: typeof requestIdFromRequest
  readonly decodeThreadParams: typeof decodeThreadParams
  readonly decodeMessagesQuery: typeof decodeMessagesQuery
  readonly decodeMessageCursor: typeof decodeMessageCursor
  readonly getOrCreateSession: typeof getOrCreateSession
  readonly assertThreadOwnership: typeof assertThreadOwnership
  readonly listThreadMessages: typeof listThreadMessages
  readonly encodeMessageCursor: typeof encodeMessageCursor
  readonly ok: typeof ok
  readonly errorResponse: typeof errorResponse
}

const liveDependencies: ThreadMessagesGetDependencies = {
  requestIdFromRequest,
  decodeThreadParams,
  decodeMessagesQuery,
  decodeMessageCursor,
  getOrCreateSession,
  assertThreadOwnership,
  listThreadMessages,
  encodeMessageCursor,
  ok,
  errorResponse
}

const handleThreadMessagesGet = Effect.fn("ThreadMessagesRoute.GET")(function* (
  request: Request,
  context: { params: Promise<{ threadId: string }> },
  requestId: string,
  deps: ThreadMessagesGetDependencies
) {
  const rawParams = yield* Effect.tryPromise({
    try: () => context.params,
    catch: toAppError
  })
  const params = yield* Effect.try({
    try: () => deps.decodeThreadParams(rawParams),
    catch: toAppError
  })

  const url = new URL(request.url)
  const query = yield* Effect.try({
    try: () =>
      deps.decodeMessagesQuery({
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined
      }),
    catch: toAppError
  })

  const pageLimit = query.limit ?? 50
  const decodedCursor = query.cursor ? deps.decodeMessageCursor(query.cursor) : null
  if (query.cursor && !decodedCursor) {
    return yield* Effect.fail(new ValidationError("Invalid cursor"))
  }

  const session = yield* Effect.tryPromise({
    try: () => deps.getOrCreateSession(),
    catch: toAppError
  })
  yield* Effect.tryPromise({
    try: () => deps.assertThreadOwnership(params.threadId, session.sessionId),
    catch: toAppError
  })

  const rows = yield* Effect.tryPromise({
    try: () => deps.listThreadMessages(params.threadId, pageLimit + 1, decodedCursor ?? undefined),
    catch: toAppError
  })

  const messages = rows.slice(0, pageLimit)
  const last = messages[messages.length - 1]
  const nextCursor = rows.length > pageLimit && last ? deps.encodeMessageCursor({ createdAt: last.createdAt, id: last.id }) : null

  return deps.ok({ threadId: params.threadId, messages, nextCursor }, requestId)
})

export const createThreadMessagesGetHandler =
  (deps: ThreadMessagesGetDependencies = liveDependencies) =>
  async (request: Request, context: { params: Promise<{ threadId: string }> }) => {
    const requestId = deps.requestIdFromRequest(request)
    return Effect.runPromise(
      handleThreadMessagesGet(request, context, requestId, deps).pipe(
        Effect.catchAll((error) => Effect.succeed(deps.errorResponse(error, requestId))),
        Effect.catchAllDefect((defect) => Effect.succeed(deps.errorResponse(defect, requestId)))
      )
    )
  }

export const GET = createThreadMessagesGetHandler()
