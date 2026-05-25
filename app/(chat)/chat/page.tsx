import { redirect } from "next/navigation"

import { SecondaryButtonLink } from "@/components/ui/button"
import { ChatShell } from "@/components/chat/chat-shell"
import { getAuthSession } from "@/server/auth"
import { hasBypassAccess } from "@/lib/security/bypass"

export const dynamic = "force-dynamic"

export default async function ChatPage() {
  const [session, bypass] = await Promise.all([getAuthSession(), hasBypassAccess()])
  if (!session?.user && !bypass) redirect("/")

  return (
    <main className="container chat-page">
      <div>
        <SecondaryButtonLink href="/">Back</SecondaryButtonLink>
      </div>
      <ChatShell />
    </main>
  )
}
