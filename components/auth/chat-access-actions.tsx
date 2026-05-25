"use client"

import { useEffect, useState } from "react"

import { AccountAction } from "@/components/auth/account-action"
import { SecondaryButton, SecondaryButtonLink } from "@/components/ui/button"
import { authClient } from "@/lib/auth"

export function ChatAccessActions() {
  const { data: authSession, isPending } = authClient.useSession()
  const [bypass, setBypass] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/bypass/status", { cache: "no-store" })
        const body = await response.json()
        setBypass(Boolean(body?.bypass))
      } catch {
        setBypass(false)
      }
    })()
  }, [])

  const canOpenChat = Boolean(authSession?.user) || bypass

  return (
    <div className="landing-actions">
      {canOpenChat ? (
        <SecondaryButtonLink href="/chat">Open chat</SecondaryButtonLink>
      ) : (
        <SecondaryButton disabled title={isPending ? "Checking account" : "Sign in to access chat"} type="button">
          Open chat
        </SecondaryButton>
      )}
      <AccountAction className="account-action-inline" />
    </div>
  )
}
