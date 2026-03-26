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
    <li className="window citation-card">
      <strong className="citation-filename">{citation.filename}</strong> (page {citation.pageNumber ?? "n/a"})
      <div className="citation-snippet">{snippet}</div>
      {truncated ? (
        <SecondaryButton
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="citation-toggle"
          aria-expanded={expanded}
        >
          {expanded ? "Collapse snippet" : "Expand snippet"}
        </SecondaryButton>
      ) : null}
    </li>
  )
}
