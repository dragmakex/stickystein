"use client"

import { useState } from "react"

import { PrimaryButton } from "@/components/ui/button"

export function MessageInput({
  disabled,
  onSend
}: {
  disabled?: boolean
  onSend: (question: string) => Promise<void>
}) {
  const [question, setQuestion] = useState("")
  const inputId = "chat-question-input"

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        if (!question.trim()) return
        const value = question
        setQuestion("")
        await onSend(value)
      }}
      className="chat-input-form"
      aria-label="Ask a question about indexed documents"
    >
      <label htmlFor={inputId} className="sr-only">
        Ask a question about indexed documents
      </label>
      <input
        id={inputId}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask about the indexed PDFs"
        disabled={disabled}
        className="input98 chat-input-field"
      />
      <PrimaryButton disabled={disabled} type="submit" className="chat-input-submit">
        Send
      </PrimaryButton>
    </form>
  )
}
