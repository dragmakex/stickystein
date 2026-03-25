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
  const [loadingNote, setLoadingNote] = useState("Consulting the files")
  const [loadingTick, setLoadingTick] = useState(0)

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

  useEffect(() => {
    if (!pending) {
      setLoadingTick(0)
      return
    }

    const interval = window.setInterval(() => {
      setLoadingTick((current) => (current + 1) % 4)
    }, 600)

    return () => {
      window.clearInterval(interval)
    }
  }, [pending])

  const onSend = async (question: string) => {
    if (!threadId) return
    const optimisticUserId = `tmp-user-${crypto.randomUUID()}`
    setMessages((previous) => [
      ...previous,
      { id: optimisticUserId, role: "user", content: question }
    ])
    setPending(true)
    setError(null)
    setLoadingNote("Consulting the files")

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, question })
      })
      if (!response.ok) {
        const body = await response.json()
        await refreshMessages(threadId)
        setError(body?.error?.message ?? "Request failed")
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const processEvent = async (rawEvent: string) => {
        let eventName = "message"
        let data = ""
        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim()
          if (line.startsWith("data:")) data += line.slice(5).trim()
        }
        if (!data) return false

        const payload = JSON.parse(data) as { message?: string }
        if (eventName === "status" && payload.message) {
          setLoadingNote(payload.message)
          return false
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
          if (shouldStop) return
          boundary = buffer.indexOf("\n\n")
        }

        if (done) break
      }

      await refreshMessages(threadId)
      playUiAnswerReady()
    } catch {
      await refreshMessages(threadId)
      setError("Unexpected error while sending message")
    } finally {
      setPending(false)
      setLoadingNote("Consulting the files")
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
      {pending ? (
        <div className="window chat-loading" role="status" aria-live="polite">
          <div>
            <div className="chat-loading-title">
              {loadingNote}
              <span className="chat-loading-dots" aria-hidden="true" data-step={loadingTick} />
            </div>
          </div>
          <div className="win-spinner" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
      <MessageInput onSend={onSend} disabled={pending || !threadId} />
      </div>
    </section>
  )
}
