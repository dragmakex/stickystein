export type CursorPage<T> = {
  readonly items: ReadonlyArray<T>
  readonly nextCursor: string | null
}

export type MessageCursor = {
  readonly createdAt: string
  readonly id: string
}

export const encodeMessageCursor = (cursor: MessageCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

export const decodeMessageCursor = (raw: string): MessageCursor | null => {
  try {
    const text = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null
    if (!parsed.createdAt || !parsed.id) return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}
