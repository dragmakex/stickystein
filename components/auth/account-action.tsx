"use client"

import { useState } from "react"

import { AuthPanel } from "@/components/auth/auth-panel"
import { QueryPackButton } from "@/components/billing/query-pack-button"
import { PrimaryButton, SecondaryButton } from "@/components/ui/button"
import { authClient } from "@/lib/auth"

export function AccountAction({ className = "" }: { className?: string } = {}) {
  const { data: authSession, isPending } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signedIn = Boolean(authSession?.user)

  return (
    <div className={`account-action ${className}`.trim()}>
      {isPending ? (
        <SecondaryButton disabled type="button">
          Checking...
        </SecondaryButton>
      ) : signedIn ? (
        <div className="account-action-signed-in">
          <span className="account-action-user">{authSession?.user.name || authSession?.user.email}</span>
          <QueryPackButton label="Buy 5 queries — $1" onError={setError} />
        </div>
      ) : (
        <PrimaryButton onClick={() => setOpen((current) => !current)} type="button">
          Sign in
        </PrimaryButton>
      )}
      {error ? <p className="billing-error account-action-error">{error}</p> : null}
      {open && !signedIn ? (
        <div className="account-action-popover">
          <AuthPanel compact />
        </div>
      ) : null}
    </div>
  )
}
