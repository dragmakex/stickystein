"use client"

import { PrimaryButton } from "@/components/ui/button"

export function IndexingControls({ onRun, disabled }: { onRun: () => Promise<void>; disabled?: boolean }) {
  return (
    <PrimaryButton onClick={() => void onRun()} disabled={disabled}>
      Run Indexing
    </PrimaryButton>
  )
}
