import { NextResponse } from "next/server"

import { ValidationError } from "@/lib/errors"
import { errorResponse, parseJsonBody, requestIdFromRequest } from "@/lib/http"
import { BYPASS_COOKIE_NAME, bypassCookieMaxAge, createBypassCookieValue, verifyBypassSecret } from "@/lib/security/bypass"

export const POST = async (request: Request) => {
  const requestId = requestIdFromRequest(request)

  try {
    const body = await parseJsonBody(request, { maxBytes: 4 * 1024 })
    const secret = typeof body === "object" && body !== null && "secret" in body ? String(body.secret) : ""
    if (!secret || !verifyBypassSecret(secret)) {
      throw new ValidationError("Invalid secret key")
    }

    const response = NextResponse.json({ ok: true })
    response.headers.set("x-request-id", requestId)
    response.cookies.set(BYPASS_COOKIE_NAME, createBypassCookieValue(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: bypassCookieMaxAge
    })
    return response
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
