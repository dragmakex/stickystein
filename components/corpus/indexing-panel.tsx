"use client"

import { useEffect, useState } from "react"

import { DocumentStatusTable } from "@/components/corpus/document-status-table"
import { IndexingControls } from "@/components/corpus/indexing-controls"
import { SecondaryButton } from "@/components/ui/button"

type DocumentRow = {
  documentId: string
  filename: string
  status: string
  pageCount: number | null
  lastIndexedAt: string | null
  latestJob: {
    jobId: string
    status: string
    progress: number
  } | null
}

export function IndexingPanel() {
  const [documents, setDocuments] = useState<ReadonlyArray<DocumentRow>>([])
  const [token, setToken] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenInputId = "index-admin-token"

  const loadDocuments = async () => {
    const response = await fetch("/api/index/documents")
    const body = await response.json()
    if (!response.ok) {
      throw new Error(body?.error?.message ?? "Could not load documents")
    }
    setDocuments(body.documents ?? [])
  }

  useEffect(() => {
    void loadDocuments().catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
    const timer = setInterval(() => {
      void loadDocuments().catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  const runIndexing = async () => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/index/run", {
        method: "POST",
        headers: token ? { "x-admin-token": token } : undefined
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body?.error?.message ?? "Could not enqueue job")
        return
      }
      await loadDocuments()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="window">
      <h2 className="window-title">Corpus Index Status</h2>
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            id={tokenInputId}
            className="input98"
            style={{ flex: 1, minWidth: 220 }}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Optional admin token for indexing controls"
            aria-describedby="index-admin-token-help"
          />
          <label htmlFor={tokenInputId} className="sr-only">Admin token for indexing controls</label>
          <IndexingControls onRun={runIndexing} disabled={pending} />
          <SecondaryButton onClick={() => void loadDocuments()} disabled={pending}>
            Refresh
          </SecondaryButton>
        </div>
        <p id="index-admin-token-help" className="sr-only">Leave blank when indexing does not require an admin token.</p>
        {error ? <p style={{ color: "#b91c1c", margin: 0 }} role="alert" aria-live="assertive">{error}</p> : null}
        <DocumentStatusTable documents={documents} />
      </div>
    </section>
  )
}
