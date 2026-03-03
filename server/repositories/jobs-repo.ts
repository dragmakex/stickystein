import { withDb } from "@/db/client"
import { makeId } from "@/lib/ids"

export type IndexJob = {
  readonly id: string
  readonly jobType: "index_document" | "index_corpus"
  readonly documentId: string | null
  readonly status: "queued" | "running" | "retrying" | "succeeded" | "failed"
  readonly progress: number
  readonly attempts: number
  readonly maxAttempts: number
}

export const enqueueJob = async (input: { jobType: IndexJob["jobType"]; documentId?: string }): Promise<IndexJob> => {
  return withDb(async (sql) => {
    const id = makeId("job")
    const [row] = await sql<IndexJob[]>`
      INSERT INTO index_jobs (id, job_type, document_id, status, progress)
      VALUES (${id}, ${input.jobType}, ${input.documentId ?? null}, 'queued', 0)
      RETURNING id, job_type as "jobType", document_id as "documentId", status, progress, attempts, max_attempts as "maxAttempts"
    `
    return row
  })
}

export const claimNextJob = async (): Promise<IndexJob | null> => {
  return withDb(async (sql) => {
    const rows = await sql<IndexJob[]>`
      WITH candidate AS (
        SELECT id
        FROM index_jobs
        WHERE status IN ('queued', 'retrying')
          AND (scheduled_at IS NULL OR scheduled_at <= now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE index_jobs j
      SET status = 'running',
          attempts = attempts + 1,
          heartbeat_at = now(),
          updated_at = now()
      FROM candidate
      WHERE j.id = candidate.id
      RETURNING j.id, j.job_type as "jobType", j.document_id as "documentId", j.status, j.progress, j.attempts, j.max_attempts as "maxAttempts"
    `
    return rows[0] ?? null
  })
}

export const updateJobProgress = async (jobId: string, progress: number): Promise<void> => {
  await withDb(async (sql) => {
    await sql`UPDATE index_jobs SET progress = ${progress}, heartbeat_at = now(), updated_at = now() WHERE id = ${jobId}`
  })
}

export const completeJob = async (jobId: string): Promise<void> => {
  await withDb(async (sql) => {
    await sql`UPDATE index_jobs SET status = 'succeeded', progress = 100, updated_at = now() WHERE id = ${jobId}`
  })
}

export const failJob = async (jobId: string, errorCode: string, errorMessage: string): Promise<void> => {
  await withDb(async (sql) => {
    await sql`
      UPDATE index_jobs
      SET status = 'failed', error_code = ${errorCode}, error_message = ${errorMessage}, updated_at = now()
      WHERE id = ${jobId}
    `
  })
}

export const rescheduleRunningJob = async (
  jobId: string,
  delaySeconds: number,
  errorCode: string,
  errorMessage: string
): Promise<void> => {
  await withDb(async (sql) => {
    await sql`
      UPDATE index_jobs
      SET status = 'retrying',
          error_code = ${errorCode},
          error_message = ${errorMessage},
          scheduled_at = now() + make_interval(secs => ${Math.max(1, Math.floor(delaySeconds))}),
          updated_at = now()
      WHERE id = ${jobId}
        AND status = 'running'
    `
  })
}

export const retryJob = async (jobId: string): Promise<void> => {
  await withDb(async (sql) => {
    await sql`
      UPDATE index_jobs
      SET status = 'retrying',
          scheduled_at = now() + interval '30 seconds',
          updated_at = now()
      WHERE id = ${jobId}
        AND status = 'failed'
    `
  })
}
