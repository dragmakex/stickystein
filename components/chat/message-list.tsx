import { CitationList } from "@/components/chat/citation-list"
import type { CitationView } from "@/components/chat/citation-item"

type Message = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  citations?: ReadonlyArray<CitationView>
}

export function MessageList({ messages }: { messages: ReadonlyArray<Message> }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {messages.map((message) => (
        <article key={message.id} className="window" style={{ padding: 12, background: "#f3f0ed" }}>
          <div style={{ fontSize: 12, color: "#334155", marginBottom: 6, textTransform: "uppercase" }}>{message.role}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          <CitationList citations={message.citations} />
        </article>
      ))}
    </div>
  )
}
