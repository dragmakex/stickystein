import Link from "next/link"
import { CorpusListPanel } from "@/components/chat/corpus-list-panel"
import { SecondaryButtonLink } from "@/components/ui/button"

export default function HomePage() {
  return (
    <main className="container landing-shell">
      <section className="window landing-card">
        <div className="window-title landing-titlebar">
          <span className="landing-titlebar-label">STICKYSTEIN.EXE</span>
          <span className="landing-titlebar-controls">
            <span className="landing-titlebar-button">_</span>
            <span className="landing-titlebar-button">□</span>
            <Link
              href="https://alxstai.com"
              target="_blank"
              rel="noreferrer"
              className="landing-titlebar-button landing-titlebar-button-link"
              aria-label="Open alxstai.com"
            >
              X
            </Link>
          </span>
        </div>
        <div className="landing-copy">
          <h2 className="landing-heading">Stickystein</h2>
          <p className="landing-description">Ask questions over the Epstein PDFs with citations.</p>
          <SecondaryButtonLink href="/chat">Open chat</SecondaryButtonLink>
        </div>
      </section>
      <CorpusListPanel />
    </main>
  )
}
