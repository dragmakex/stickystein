"use client"

import { useEffect, useMemo, useState } from "react"

import { SecondaryButton } from "@/components/ui/button"

type DocumentRow = {
  documentId: string
  filename: string
  status: string
}

const PAGE_SIZE = 25

export function CorpusListPanel() {
  const [documents, setDocuments] = useState<ReadonlyArray<DocumentRow>>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/index/documents", { cache: "no-store" })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "Could not load indexed PDFs")
        }
        setDocuments(body.documents ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load indexed PDFs")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const totalPages = Math.max(1, Math.ceil(documents.length / PAGE_SIZE))
  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE

  const pagedDocuments = useMemo(() => documents.slice(start, end), [documents, start, end])

  return (
    <section className="window corpus-card">
      <div className="window-title">Indexed PDFs</div>
      <div className="corpus-panel">
        <div className="corpus-panel-header">
          <p className="corpus-meta">{loading ? "Loading..." : `${documents.length} indexed PDFs`}</p>
          <p className="corpus-meta">Page {page} of {totalPages}</p>
        </div>
        {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        <div className="table-scroll">
          <table className="status-table">
            <thead>
              <tr>
                <th align="left">File</th>
                <th className="status-table-availability">Available</th>
              </tr>
            </thead>
            <tbody>
              {pagedDocuments.map((document) => (
                <tr key={document.documentId}>
                  <td>{document.filename}</td>
                  <td className="status-table-availability">{document.status === "ready" ? "✓" : ""}</td>
                </tr>
              ))}
              {!loading && pagedDocuments.length === 0 ? (
                <tr>
                  <td colSpan={2}>No indexed PDFs found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="corpus-pagination">
          <SecondaryButton onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            Previous
          </SecondaryButton>
          <SecondaryButton onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
            Next
          </SecondaryButton>
        </div>
      </div>
    </section>
  )
}
