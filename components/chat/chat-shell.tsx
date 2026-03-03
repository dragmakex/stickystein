"use client"

import { useEffect, useState } from "react"

import { MessageInput } from "@/components/chat/message-input"
import { MessageList } from "@/components/chat/message-list"
import { SensitiveCorpusDisclaimer } from "@/components/chat/sensitive-corpus-disclaimer"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  citations?: ReadonlyArray<{
    documentId: string
    filename: string
    pageNumber: number | null
    chunkId: string
    snippet: string
  }>
}

export function ChatShell() {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const body = await response.json()
      setThreadId(body.threadId)
    })()
  }, [])

  const onSend = async (question: string) => {
    if (!threadId) return
    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, question })
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.error?.message ?? "Request failed")
        return
      }

      const refreshed = await fetch(`/api/threads/${threadId}/messages`)
      const refreshedBody = await refreshed.json()
      setMessages(refreshedBody.messages)
    } catch {
      setError("Unexpected error while sending message")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="window" aria-labelledby="chat-panel-title">
      <h2 className="window-title">Chat</h2>
      <div style={{ padding: 12 }}>
      <h3 id="chat-panel-title" className="sr-only">Chat conversation panel</h3>
      <SensitiveCorpusDisclaimer />
      {error ? <p style={{ color: "#b91c1c" }} role="alert" aria-live="assertive">{error}</p> : null}
      <MessageList messages={messages} />
      <MessageInput onSend={onSend} disabled={pending || !threadId} />
      </div>
    </section>
  )
}
