import { Schema } from "effect"
import { randomBytes } from "node:crypto"

const EnvSchema = Schema.Struct({
  NODE_ENV: Schema.optional(Schema.String),
  APP_BASE_URL: Schema.optional(Schema.String),
  LOG_LEVEL: Schema.optional(Schema.String),
  SESSION_SECRET: Schema.optional(Schema.String),
  DATABASE_URL: Schema.optional(Schema.String),
  PDF_DATA_DIR: Schema.optional(Schema.String),
  PDF_PREPROCESS_COMMAND: Schema.optional(Schema.String),
  LLM_PROVIDER: Schema.optional(Schema.String),
  LLM_API_KEY: Schema.optional(Schema.String),
  LLM_BASE_URL: Schema.optional(Schema.String),
  LLM_MODEL: Schema.optional(Schema.String),
  EMBEDDING_PROVIDER: Schema.optional(Schema.String),
  EMBEDDING_API_KEY: Schema.optional(Schema.String),
  EMBEDDING_BASE_URL: Schema.optional(Schema.String),
  EMBEDDING_MODEL: Schema.optional(Schema.String),
  EMBEDDING_TIMEOUT_MS: Schema.optional(Schema.String),
  EMBEDDING_BATCH_SIZE: Schema.optional(Schema.String),
  ADMIN_INGEST_TOKEN: Schema.optional(Schema.String)
})

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseInteger = (name: string, value: string | undefined, fallback: number, min = 1): number => {
  const parsed = numberFromEnv(value, fallback)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}`)
  }
  return parsed
}

const parseNumberInRange = (name: string, value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = numberFromEnv(value, fallback)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`)
  }
  return parsed
}

const oneOf = <T extends string>(name: string, value: string | undefined, fallback: T, allowed: ReadonlyArray<T>): T => {
  const selected = (value ?? fallback) as T
  if (!allowed.includes(selected)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`)
  }
  return selected
}

const ensureHttpUrl = (name: string, value: string): string => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`)
  }

  return value
}

export const parseEnvironment = (processEnv: NodeJS.ProcessEnv, fallbackSessionSecret?: string) => {
  const parsedRaw = Schema.decodeUnknownSync(EnvSchema)(processEnv)
  const nodeEnv = oneOf("NODE_ENV", parsedRaw.NODE_ENV, "development", ["development", "test", "production"])
  const isNextProductionBuild = processEnv.NEXT_PHASE === "phase-production-build"
  const logLevel = oneOf("LOG_LEVEL", parsedRaw.LOG_LEVEL, "info", ["debug", "info", "warn", "error"])
  const sessionSecret = parsedRaw.SESSION_SECRET ?? fallbackSessionSecret ?? randomBytes(32).toString("hex")

  const output = {
    nodeEnv,
    appBaseUrl: ensureHttpUrl("APP_BASE_URL", parsedRaw.APP_BASE_URL ?? "http://localhost:3000"),
    logLevel,
    sessionSecret,
    databaseUrl: parsedRaw.DATABASE_URL ?? "",
    pdfDataDir: parsedRaw.PDF_DATA_DIR ?? "data",
    pdfPreprocessCommand: parsedRaw.PDF_PREPROCESS_COMMAND ?? "",
    llm: {
      provider: oneOf("LLM_PROVIDER", parsedRaw.LLM_PROVIDER, "openai-compatible", ["openai-compatible", "mock"]),
      apiKey: parsedRaw.LLM_API_KEY ?? "",
      baseUrl: parsedRaw.LLM_BASE_URL ?? "",
      model: parsedRaw.LLM_MODEL ?? "",
      timeoutMs: parseInteger("LLM_TIMEOUT_MS", processEnv.LLM_TIMEOUT_MS, 30000),
      maxOutputTokens: parseInteger("LLM_MAX_OUTPUT_TOKENS", processEnv.LLM_MAX_OUTPUT_TOKENS, 1024),
      temperature: parseNumberInRange("LLM_TEMPERATURE", processEnv.LLM_TEMPERATURE, 0.1, 0, 2)
    },
    embeddings: {
      provider: oneOf("EMBEDDING_PROVIDER", parsedRaw.EMBEDDING_PROVIDER, "mock", ["openai-compatible", "mock"]),
      apiKey: parsedRaw.EMBEDDING_API_KEY ?? "",
      baseUrl: parsedRaw.EMBEDDING_BASE_URL ?? "",
      model: parsedRaw.EMBEDDING_MODEL ?? "",
      dimensions: parseInteger("EMBEDDING_DIMENSIONS", processEnv.EMBEDDING_DIMENSIONS, 128),
      timeoutMs: parseInteger("EMBEDDING_TIMEOUT_MS", processEnv.EMBEDDING_TIMEOUT_MS, 120000),
      batchSize: parseInteger("EMBEDDING_BATCH_SIZE", processEnv.EMBEDDING_BATCH_SIZE, 16)
    },
    rag: {
      chunkSize: parseInteger("RAG_CHUNK_SIZE", processEnv.RAG_CHUNK_SIZE, 1200),
      chunkOverlap: parseInteger("RAG_CHUNK_OVERLAP", processEnv.RAG_CHUNK_OVERLAP, 150, 0),
      topKVector: parseInteger("RAG_TOP_K_VECTOR", processEnv.RAG_TOP_K_VECTOR, 20),
      topKLexical: parseInteger("RAG_TOP_K_LEXICAL", processEnv.RAG_TOP_K_LEXICAL, 20),
      topKFinal: parseInteger("RAG_TOP_K_FINAL", processEnv.RAG_TOP_K_FINAL, 8),
      maxContextChars: parseInteger("RAG_MAX_CONTEXT_CHARS", processEnv.RAG_MAX_CONTEXT_CHARS, 24000)
    },
    rateLimit: {
      chatWindowSec: parseInteger("RATE_LIMIT_CHAT_WINDOW_SEC", processEnv.RATE_LIMIT_CHAT_WINDOW_SEC, 60),
      chatMax: parseInteger("RATE_LIMIT_CHAT_MAX", processEnv.RATE_LIMIT_CHAT_MAX, 10),
      threadsWindowSec: parseInteger("RATE_LIMIT_THREADS_WINDOW_SEC", processEnv.RATE_LIMIT_THREADS_WINDOW_SEC, 60),
      threadsMax: parseInteger("RATE_LIMIT_THREADS_MAX", processEnv.RATE_LIMIT_THREADS_MAX, 20),
      indexWindowSec: parseInteger("RATE_LIMIT_INDEX_WINDOW_SEC", processEnv.RATE_LIMIT_INDEX_WINDOW_SEC, 60),
      indexMax: parseInteger("RATE_LIMIT_INDEX_MAX", processEnv.RATE_LIMIT_INDEX_MAX, 3)
    },
    worker: {
      pollMs: parseInteger("JOB_WORKER_POLL_MS", processEnv.JOB_WORKER_POLL_MS, 1000),
      concurrency: parseInteger("JOB_WORKER_CONCURRENCY", processEnv.JOB_WORKER_CONCURRENCY, 1),
      maxAttempts: parseInteger("JOB_MAX_ATTEMPTS", processEnv.JOB_MAX_ATTEMPTS, 5),
      retryBaseMs: parseInteger("JOB_RETRY_BASE_MS", processEnv.JOB_RETRY_BASE_MS, 5000),
      retryMaxMs: parseInteger("JOB_RETRY_MAX_MS", processEnv.JOB_RETRY_MAX_MS, 60000)
    },
    adminIngestToken: parsedRaw.ADMIN_INGEST_TOKEN ?? ""
  }

  if (output.rag.chunkOverlap >= output.rag.chunkSize) {
    throw new Error("RAG_CHUNK_OVERLAP must be less than RAG_CHUNK_SIZE")
  }
  if (output.rag.topKFinal > output.rag.topKVector + output.rag.topKLexical) {
    throw new Error("RAG_TOP_K_FINAL must be <= RAG_TOP_K_VECTOR + RAG_TOP_K_LEXICAL")
  }
  if (output.worker.retryBaseMs > output.worker.retryMaxMs) {
    throw new Error("JOB_RETRY_BASE_MS must be <= JOB_RETRY_MAX_MS")
  }

  if (output.nodeEnv === "production" && !isNextProductionBuild) {
    if (!parsedRaw.SESSION_SECRET || parsedRaw.SESSION_SECRET.length < 32) {
      throw new Error("SESSION_SECRET is required in production and must be at least 32 characters")
    }
    if (!parsedRaw.DATABASE_URL) {
      throw new Error("DATABASE_URL is required in production")
    }
  }

  return output
}

export const env = parseEnvironment(process.env, randomBytes(32).toString("hex"))
