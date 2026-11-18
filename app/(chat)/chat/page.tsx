import { SecondaryButtonLink } from "@/components/ui/button"
import { ChatShell } from "@/components/chat/chat-shell"

export const dynamic = "force-dynamic"

export default async function ChatPage() {
  return (
    <main className="container chat-page">
      <div>
        <SecondaryButtonLink href="/">Back</SecondaryButtonLink>
      </div>
      <ChatShell />
    </main>
  )
}
