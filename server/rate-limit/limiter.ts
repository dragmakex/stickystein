import { RateLimitError } from "@/lib/errors"
import { incrementBucket } from "@/server/repositories/rate-limit-repo"

export const enforceRateLimit = async (input: {
  subjectKey: string
  routeKey: string
  windowSec: number
  max: number
}): Promise<void> => {
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / (input.windowSec * 1000)) * input.windowSec * 1000)
  const count = await incrementBucket({
    subjectKey: input.subjectKey,
    routeKey: input.routeKey,
    windowStart
  })

  if (count > input.max) {
    throw new RateLimitError("Too many requests")
  }
}
