import { IndexingPanel } from "@/components/corpus/indexing-panel"
import { SecondaryButtonLink } from "@/components/ui/button"

export default function HomePage() {
  return (
    <main className="container" style={{ display: "grid", gap: 12 }}>
      <section className="window">
        <h1 className="window-title">E-Files RAG</h1>
        <div style={{ padding: 12 }}>
          <p style={{ marginTop: 0 }}>Ask grounded questions over local PDFs with citations.</p>
          <SecondaryButtonLink href="/chat">Open Chat</SecondaryButtonLink>
        </div>
      </section>
      <IndexingPanel />
    </main>
  )
}
