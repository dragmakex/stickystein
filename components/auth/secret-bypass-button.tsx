"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

import { SecondaryButton } from "@/components/ui/button"

export function SecretBypassButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret })
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message ?? "Invalid secret key")
      router.push("/chat")
    } catch (bypassError) {
      setError(bypassError instanceof Error ? bypassError.message : "Invalid secret key")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        className="landing-titlebar-button landing-titlebar-button-link"
        aria-label="Enter secret access key"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="landing-titlebar-icon landing-titlebar-icon-minimize" />
      </button>
      {open ? (
        <div className="secret-bypass-backdrop" role="presentation">
          <section className="window secret-bypass-dialog" role="dialog" aria-modal="true" aria-labelledby="secret-bypass-title">
            <div className="window-title landing-titlebar">
              <span id="secret-bypass-title">Secret Access</span>
              <button className="landing-titlebar-button landing-titlebar-button-link" onClick={() => setOpen(false)} type="button" aria-label="Close">
                <span className="landing-titlebar-icon landing-titlebar-icon-close" />
              </button>
            </div>
            <form className="secret-bypass-body" onSubmit={(event) => void submit(event)}>
              <label htmlFor="secret-bypass-input" className="billing-meta">
                Enter secret key
              </label>
              <input
                id="secret-bypass-input"
                className="input98"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                disabled={pending}
                autoFocus
              />
              {error ? <p className="billing-error">{error}</p> : null}
              <div className="secret-bypass-actions">
                <SecondaryButton type="button" onClick={() => setOpen(false)} disabled={pending}>
                  Cancel
                </SecondaryButton>
                <SecondaryButton type="submit" disabled={pending || !secret.trim()}>
                  {pending ? "Checking..." : "Enter chat"}
                </SecondaryButton>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
