import { CitationItem, type CitationView } from "@/components/chat/citation-item"

export function CitationList({ citations }: { citations?: ReadonlyArray<CitationView> }) {
  if (!citations || citations.length === 0) return null

  return (
    <ul style={{ marginTop: 8, paddingLeft: 20 }}>
      {citations.map((citation) => (
        <CitationItem key={citation.chunkId} citation={citation} />
      ))}
    </ul>
  )
}
