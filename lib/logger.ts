type Level = "debug" | "info" | "warn" | "error"

const SENSITIVE_KEY_PATTERNS = ["key", "secret", "token", "password", "credential", "auth", "cookie", "session"]
const REDACTED = "[REDACTED]"

const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern))
}

const redact = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (!value || typeof value !== "object") return value

  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen))
  }

  const objectValue = value as Record<string, unknown>
  const clone: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(objectValue)) {
    clone[key] = isSensitiveKey(key) ? REDACTED : redact(child, seen)
  }
  return clone
}

const write = (level: Level, message: string, meta?: unknown) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    meta: redact(meta)
  }
  const line = JSON.stringify(payload)
  if (level === "error") {
    console.error(line)
    return
  }
  console.log(line)
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta)
}
