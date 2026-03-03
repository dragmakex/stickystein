const normalizeCandidate = (value: string): string => value.trim().replace(/^\[|\]$/g, "")

const maybeIpFromForwardedFor = (headerValue: string | null): string | null => {
  if (!headerValue) return null
  const first = normalizeCandidate(headerValue.split(",")[0] ?? "")
  if (!first) return null
  if (!/^[a-fA-F0-9:.]{2,64}$/.test(first)) return null
  return first
}

export const clientIpFromRequest = (request: Request): string => {
  const forwarded = maybeIpFromForwardedFor(request.headers.get("x-forwarded-for"))
  if (forwarded) return forwarded

  const realIp = normalizeCandidate(request.headers.get("x-real-ip") ?? "")
  if (/^[a-fA-F0-9:.]{2,64}$/.test(realIp)) return realIp

  return "local"
}
