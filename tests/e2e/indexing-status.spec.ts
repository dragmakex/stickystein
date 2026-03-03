import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import HomePage from "@/app/page"

test("indexing status screen includes responsive table container and controls", () => {
  const html = renderToStaticMarkup(createElement(HomePage))

  expect(html).toContain("Corpus Index Status")
  expect(html).toContain('id="index-admin-token"')
  expect(html).toContain('class="table-scroll"')
  expect(html).toContain('class="status-table"')
  expect(html).toContain("Run Indexing")
})
