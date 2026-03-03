"use client"

import { useMemo, useState } from "react"

import { SecondaryButton } from "@/components/ui/button"
import { previewText } from "@/lib/utils/text"

export type CitationView = {
  documentId: string
  filename: string
  pageNumber: number | null
  chunkId: string
  snippet: string
}

export function CitationItem({ citation }: { citation: CitationView }) {
  const [expanded, setExpanded] = useState(false)
  const { preview, truncated } = useMemo(() => previewText(citation.snippet, 220), [citation.snippet])
  const snippet = expanded ? citation.snippet : preview

  return (
    <li className="window" style={{ marginBottom: 8, padding: 8, background: "#ece9d8" }}>
      <strong>{citation.filename}</strong> (page {citation.pageNumber ?? "n/a"})
      <div style={{ fontSize: 12, color: "#334155", marginTop: 6, whiteSpace: "pre-wrap" }}>{snippet}</div>
      {truncated ? (
        <SecondaryButton
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{ marginTop: 8, minHeight: 26, padding: "4px 8px", fontSize: 12 }}
          aria-expanded={expanded}
        >
          {expanded ? "Collapse snippet" : "Expand snippet"}
        </SecondaryButton>
      ) : null}
    </li>
  )
}
