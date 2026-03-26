import { expect, test } from "bun:test"

import { parseEnvironment } from "@/lib/env"

const baseEnv = {
  NODE_ENV: "development",
  APP_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "info",
  SESSION_SECRET: "",
  DATABASE_URL: "",
  PDF_DATA_DIR: "data",
  PDF_PREPROCESS_COMMAND: "",
  LLM_PROVIDER: "openai-compatible",
  LLM_API_KEY: "",
  LLM_BASE_URL: "",
  LLM_MODEL: "",
  LLM_TIMEOUT_MS: "30000",
  LLM_MAX_OUTPUT_TOKENS: "1024",
  LLM_TEMPERATURE: "0.1",
  EMBEDDING_PROVIDER: "mock",
  EMBEDDING_API_KEY: "",
  EMBEDDING_BASE_URL: "",
  EMBEDDING_MODEL: "",
  EMBEDDING_DIMENSIONS: "128",
  EMBEDDING_TIMEOUT_MS: "120000",
  EMBEDDING_BATCH_SIZE: "16",
  RAG_CHUNK_SIZE: "1200",
  RAG_CHUNK_OVERLAP: "150",
  RAG_TOP_K_VECTOR: "20",
  RAG_TOP_K_LEXICAL: "20",
  RAG_TOP_K_FINAL: "8",
  RAG_MAX_CONTEXT_CHARS: "24000",
  RATE_LIMIT_CHAT_WINDOW_SEC: "60",
  RATE_LIMIT_CHAT_MAX: "10",
  RATE_LIMIT_THREADS_WINDOW_SEC: "60",
  RATE_LIMIT_THREADS_MAX: "20",
  RATE_LIMIT_INDEX_WINDOW_SEC: "60",
  RATE_LIMIT_INDEX_MAX: "3",
  JOB_WORKER_POLL_MS: "1000",
  JOB_WORKER_CONCURRENCY: "1",
  JOB_MAX_ATTEMPTS: "5",
  JOB_RETRY_BASE_MS: "5000",
  JOB_RETRY_MAX_MS: "60000",
  ADMIN_INGEST_TOKEN: ""
} satisfies Record<string, string>

const makeEnv = (overrides: Partial<Record<string, string>> = {}) => ({ ...baseEnv, ...overrides }) as NodeJS.ProcessEnv

test("parseEnvironment applies defaults and accepts valid dev config", () => {
  const env = parseEnvironment(makeEnv(), "fallback-secret-32-characters--okok")
  expect(env.nodeEnv).toBe("development")
  expect(env.pdfDataDir).toBe("data")
  expect(env.embeddings.provider).toBe("mock")
  expect(env.embeddings.timeoutMs).toBe(120000)
  expect(env.embeddings.batchSize).toBe(16)
  expect(env.rateLimit.chatMax).toBe(10)
})

test("parseEnvironment accepts openai-compatible and custom pdf data dir", () => {
  const env = parseEnvironment(
    makeEnv({
      LLM_PROVIDER: "openai-compatible",
      LLM_API_KEY: "token",
      PDF_DATA_DIR: "/srv/e-files/pdfs",
      PDF_PREPROCESS_COMMAND: "python3 scripts/unmask.py \"$INPUT_FILE\" \"$OUTPUT_FILE\""
    }),
    "fallback-secret-32-characters--okok"
  )

  expect(env.llm.provider).toBe("openai-compatible")
  expect(env.llm.apiKey).toBe("token")
  expect(env.pdfDataDir).toBe("/srv/e-files/pdfs")
  expect(env.pdfPreprocessCommand).toBe("python3 scripts/unmask.py \"$INPUT_FILE\" \"$OUTPUT_FILE\"")
})

test("parseEnvironment enforces production required secrets", () => {
  expect(() =>
    parseEnvironment(
      makeEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "",
        DATABASE_URL: "postgres://localhost:5432/db"
      }),
      "fallback-secret-32-characters--okok"
    )
  ).toThrow("SESSION_SECRET is required in production and must be at least 32 characters")
})

test("parseEnvironment enforces production database url", () => {
  expect(() =>
    parseEnvironment(
      makeEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(32),
        DATABASE_URL: ""
      }),
      "fallback-secret-32-characters--okok"
    )
  ).toThrow("DATABASE_URL is required in production")
})

test("parseEnvironment allows missing production secrets during next build phase", () => {
  const env = parseEnvironment(
    makeEnv({
      NODE_ENV: "production",
      SESSION_SECRET: "",
      DATABASE_URL: "",
      NEXT_PHASE: "phase-production-build"
    }),
    "fallback-secret-32-characters--okok"
  )

  expect(env.nodeEnv).toBe("production")
})

test("parseEnvironment rejects unknown provider values", () => {
  expect(() => parseEnvironment(makeEnv({ LLM_PROVIDER: "unknown" }), "fallback-secret-32-characters--okok")).toThrow(
    "LLM_PROVIDER must be one of: openai-compatible, mock"
  )
})

test("parseEnvironment rejects out-of-range temperatures", () => {
  expect(() => parseEnvironment(makeEnv({ LLM_TEMPERATURE: "9" }), "fallback-secret-32-characters--okok")).toThrow(
    "LLM_TEMPERATURE must be between 0 and 2"
  )
})

test("parseEnvironment validates overlap and chunk size relationship", () => {
  expect(() =>
    parseEnvironment(
      makeEnv({
        RAG_CHUNK_SIZE: "200",
        RAG_CHUNK_OVERLAP: "200"
      }),
      "fallback-secret-32-characters--okok"
    )
  ).toThrow("RAG_CHUNK_OVERLAP must be less than RAG_CHUNK_SIZE")
})
