import postgres, { type Sql } from "postgres"

import { DatabaseError } from "@/lib/errors"
import { env } from "@/lib/env"

let sqlClient: Sql | null = null

export const db = (): Sql => {
  if (!env.databaseUrl) {
    throw new DatabaseError("DATABASE_URL is required")
  }

  if (!sqlClient) {
    sqlClient = postgres(env.databaseUrl, { prepare: true })
  }

  return sqlClient
}

export const withDb = async <T>(operation: (sql: Sql) => Promise<T>): Promise<T> => {
  try {
    return await operation(db())
  } catch (error) {
    if (error instanceof DatabaseError) throw error
    throw new DatabaseError("Database operation failed", error)
  }
}
