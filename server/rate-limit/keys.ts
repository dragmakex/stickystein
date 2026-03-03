export const routeKeys = {
  chat: "chat",
  createThread: "threads-create",
  indexRun: "index-run",
  indexRetry: "index-retry"
} as const

export const subjectKey = (ip: string, sessionId: string): string => `${ip}:${sessionId}`
