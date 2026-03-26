import { CitationList } from "@/components/chat/citation-list"
import type { CitationView } from "@/components/chat/citation-item"
import { MessageContent } from "@/components/chat/message-content"

type Message = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  citations?: ReadonlyArray<CitationView>
  pending?: boolean
}

export function MessageList({ messages }: { messages: ReadonlyArray<Message> }) {
  return (
    <div className="chat-message-list">
      {messages.map((message) => (
        <article key={message.id} className="window chat-message-card">
          <div className="chat-message-role">{message.role}</div>
          {message.pending ? (
            <div className="chat-loading-inline" role="status" aria-live="polite">
              <div className="chat-loading-title">Consulting the files...</div>
              <div className="win-spinner" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            <MessageContent content={message.content} />
          )}
          <CitationList citations={message.citations} />
        </article>
      ))}
    </div>
  )
}
