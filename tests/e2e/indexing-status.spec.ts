import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import HomePage from "@/app/page"

test("home page links into chat", () => {
  const html = renderToStaticMarkup(createElement(HomePage))

  expect(html).toContain("Stickystein")
  expect(html).toContain("Ask questions over the Epstein PDFs with citations.")
  expect(html).toContain('href="/chat"')
  expect(html).toContain("Indexed PDFs")
})
