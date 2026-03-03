import { expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import ChatPage from "@/app/(chat)/chat/page"

test("chat screen exposes accessible grounded-chat shell", () => {
  const html = renderToStaticMarkup(createElement(ChatPage))

  expect(html).toContain("Grounded Chat")
  expect(html).toContain("Answers are grounded in indexed documents")
  expect(html).toContain('aria-labelledby="chat-panel-title"')
  expect(html).toContain('aria-label="Ask a question about indexed documents"')
  expect(html).toContain('id="chat-question-input"')
})
