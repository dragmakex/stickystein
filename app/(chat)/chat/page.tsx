import { ChatShell } from "@/components/chat/chat-shell"

export default function ChatPage() {
  return (
    <main className="container" style={{ display: "grid", gap: 12 }}>
      <section className="window">
        <h1 className="window-title">Grounded Chat</h1>
        <p style={{ margin: 0, padding: 12 }}>
          Answers are grounded in indexed documents and may include uncertainty when evidence is weak.
        </p>
      </section>
      <ChatShell />
    </main>
  )
}
