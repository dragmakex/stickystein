import { withDb } from "@/db/client"

export const incrementBucket = async (input: {
  subjectKey: string
  routeKey: string
  windowStart: Date
}): Promise<number> => {
  return withDb(async (sql) => {
    const [row] = await sql<{ count: number }[]>`
      INSERT INTO rate_limit_buckets (subject_key, route_key, window_start, count)
      VALUES (${input.subjectKey}, ${input.routeKey}, ${input.windowStart.toISOString()}, 1)
      ON CONFLICT (subject_key, route_key, window_start)
      DO UPDATE SET count = rate_limit_buckets.count + 1, updated_at = now()
      RETURNING count
    `
    return row.count
  })
}
