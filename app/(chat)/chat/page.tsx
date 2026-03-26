import { SecondaryButtonLink } from "@/components/ui/button"
import { ChatShell } from "@/components/chat/chat-shell"

export default function ChatPage() {
  return (
    <main className="container chat-page">
      <div>
        <SecondaryButtonLink href="/">Back</SecondaryButtonLink>
      </div>
      <ChatShell />
    </main>
  )
}
