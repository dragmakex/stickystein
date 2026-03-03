export type AppErrorCode =
  | "internal"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "external_service"
  | "database"
  | "indexing"
  | "retrieval"

export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode
  abstract readonly status: number

  constructor(message: string, readonly detail?: unknown) {
    super(message)
  }
}

export class InternalError extends AppError {
  readonly code = "internal" as const
  readonly status = 500
}

export class ValidationError extends AppError {
  readonly code = "validation_error" as const
  readonly status = 400
}

export class UnauthorizedError extends AppError {
  readonly code = "unauthorized" as const
  readonly status = 401
}

export class ForbiddenError extends AppError {
  readonly code = "forbidden" as const
  readonly status = 403
}

export class NotFoundError extends AppError {
  readonly code = "not_found" as const
  readonly status = 404
}

export class RateLimitError extends AppError {
  readonly code = "rate_limited" as const
  readonly status = 429
}

export class ExternalServiceError extends AppError {
  readonly code = "external_service" as const
  readonly status = 502
}

export class DatabaseError extends AppError {
  readonly code = "database" as const
  readonly status = 500
}

export class IndexingError extends AppError {
  readonly code = "indexing" as const
  readonly status = 500
}

export class RetrievalError extends AppError {
  readonly code = "retrieval" as const
  readonly status = 500
}

export const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) return error
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected server error"
  return new InternalError(message, { cause: error })
}
