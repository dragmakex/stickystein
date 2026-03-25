import { Fragment, type ReactNode } from "react"

const renderInline = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }

    const token = match[0]
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`strong-${key += 1}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={`code-${key += 1}`}>{token.slice(1, -1)}</code>)
    } else {
      nodes.push(token)
    }

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

const isOrderedListItem = (line: string): boolean => /^\s*\d+\.\s+/.test(line)
const isUnorderedListItem = (line: string): boolean => /^\s*[-*]\s+/.test(line)

export function MessageContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trimEnd()
    if (!line.trim()) {
      index += 1
      continue
    }

    if (isOrderedListItem(line)) {
      const items: Array<{ text: string; nested: string[] }> = []
      while (index < lines.length && isOrderedListItem(lines[index].trimEnd())) {
        const value = lines[index].trimEnd().replace(/^\s*\d+\.\s+/, "")
        const item = { text: value, nested: [] as string[] }
        index += 1

        while (index < lines.length && isUnorderedListItem(lines[index].trimEnd())) {
          const nestedValue = lines[index].trimEnd().replace(/^\s*[-*]\s+/, "")
          item.nested.push(nestedValue)
          index += 1
        }

        items.push(item)
      }

      blocks.push(
        <ol key={`block-ol-${index}`} className="message-markdown-list">
          {items.map((item, itemIndex) => (
            <li key={`ol-${index}-${itemIndex}`}>
              {renderInline(item.text)}
              {item.nested.length > 0 ? (
                <ul>
                  {item.nested.map((nestedItem, nestedIndex) => (
                    <li key={`ol-${index}-${itemIndex}-nested-${nestedIndex}`}>{renderInline(nestedItem)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )
      continue
    }

    if (isUnorderedListItem(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && isUnorderedListItem(lines[index].trimEnd())) {
        const value = lines[index].trimEnd().replace(/^\s*[-*]\s+/, "")
        items.push(<li key={`ul-${index}`}>{renderInline(value)}</li>)
        index += 1
      }

      blocks.push(
        <ul key={`block-ul-${index}`} className="message-markdown-list">
          {items}
        </ul>
      )
      continue
    }

    const paragraph: string[] = [line.trim()]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isOrderedListItem(lines[index].trimEnd()) &&
      !isUnorderedListItem(lines[index].trimEnd())
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }

    blocks.push(
      <p key={`block-p-${index}`} className="message-markdown-paragraph">
        {renderInline(paragraph.join(" "))}
      </p>
    )
  }

  return (
    <div className="message-markdown">
      {blocks.map((block, blockIndex) => (
        <Fragment key={`block-${blockIndex}`}>{block}</Fragment>
      ))}
    </div>
  )
}
