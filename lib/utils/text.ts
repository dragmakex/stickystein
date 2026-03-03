export const compactWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim()

export const truncate = (value: string, max: number): string => {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

export const previewText = (
  value: string,
  max: number
): {
  preview: string
  truncated: boolean
} => {
  const preview = truncate(value, max)
  return {
    preview,
    truncated: preview !== value
  }
}
