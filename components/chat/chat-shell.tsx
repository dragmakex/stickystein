"use client"

import { useEffect, useState } from "react"

import { MessageInput } from "@/components/chat/message-input"
import { MessageList } from "@/components/chat/message-list"
import { SensitiveCorpusDisclaimer } from "@/components/chat/sensitive-corpus-disclaimer"
import { playUiAnswerReady } from "@/lib/ui/sound"

type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  pending?: boolean
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

  const refreshMessages = async (activeThreadId: string) => {
    const refreshed = await fetch(`/api/threads/${activeThreadId}/messages`)
    const refreshedBody = await refreshed.json()
    setMessages(refreshedBody.messages)
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/threads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const body = await response.json()
      setThreadId(body.threadId)
    })()
  }, [])

  const onSend = async (question: string) => {
    if (!threadId) return
    const optimisticUserId = `tmp-user-${crypto.randomUUID()}`
    const optimisticAssistantId = `tmp-assistant-${crypto.randomUUID()}`
    setMessages((previous) => [
      ...previous,
      { id: optimisticUserId, role: "user", content: question },
      { id: optimisticAssistantId, role: "assistant", content: "", pending: true }
    ])
    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, question })
      })
      if (!response.ok) {
        const body = await response.json()
        setMessages((previous) => previous.filter((message) => message.id !== optimisticAssistantId))
        await refreshMessages(threadId)
        setError(body?.error?.message ?? "Request failed")
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const applyDelta = (delta: string) => {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === optimisticAssistantId
              ? {
                  ...message,
                  pending: false,
                  content: `${message.content}${delta}`
                }
              : message
          )
        )
      }

      const processEvent = async (rawEvent: string) => {
        let eventName = "message"
        let data = ""
        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim()
          if (line.startsWith("data:")) data += line.slice(5).trim()
        }
        if (!data) return false

        const payload = JSON.parse(data) as { text?: string; message?: string }
        if (eventName === "delta" && payload.text) {
          applyDelta(payload.text)
        }
        if (eventName === "error") {
          setError(payload.message ?? "Request failed")
          return true
        }
        if (eventName === "done") {
          await refreshMessages(threadId)
          playUiAnswerReady()
          return true
        }

        return false
      }

      while (reader) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const shouldStop = await processEvent(rawEvent)
          if (shouldStop) {
            setPending(false)
            return
          }
          boundary = buffer.indexOf("\n\n")
        }

        if (done) break
      }

      await refreshMessages(threadId)
      playUiAnswerReady()
    } catch {
      setMessages((previous) => previous.filter((message) => message.id !== optimisticAssistantId))
      await refreshMessages(threadId)
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
