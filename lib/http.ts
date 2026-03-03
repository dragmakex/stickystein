import { NextResponse } from "next/server"

import { AppError, ValidationError } from "@/lib/errors"
import { makeId } from "@/lib/ids"
import { securityHeaders } from "@/lib/security/headers"

export const requestIdFromRequest = (request: Request): string => request.headers.get("x-request-id") ?? makeId("req")

export const ok = <T>(payload: T, requestId?: string): NextResponse => {
  const response = NextResponse.json(payload)
  if (requestId) response.headers.set("x-request-id", requestId)
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value)
  }
  return response
}

export const errorResponse = (error: unknown, requestId?: string): NextResponse => {
  const appError = error instanceof AppError ? error : null
  const status = appError?.status ?? 500
  const body = {
    error: {
      code: appError?.code ?? "internal",
      message: appError?.message ?? "Unexpected server error"
    }
  }

  const response = NextResponse.json(body, { status })
  if (requestId) response.headers.set("x-request-id", requestId)
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value)
  }
  return response
}

export const parseJsonBody = async (request: Request, options?: { maxBytes?: number; allowEmpty?: boolean }): Promise<unknown> => {
  const maxBytes = options?.maxBytes ?? 64 * 1024
  const allowEmpty = options?.allowEmpty ?? false
  const contentType = request.headers.get("content-type") ?? ""
  const raw = await request.text()

  if (raw.length === 0) {
    if (allowEmpty) return {}
    throw new ValidationError("Request body is required")
  }

  const rawBytes = Buffer.byteLength(raw, "utf8")
  if (rawBytes > maxBytes) {
    throw new ValidationError(`Request body too large (max ${maxBytes} bytes)`)
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ValidationError("Content-Type must be application/json")
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new ValidationError("Malformed JSON body")
  }
}
