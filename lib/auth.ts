"use client"

import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

const authBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL

if (!authBaseUrl) {
  throw new Error("NEXT_PUBLIC_APP_BASE_URL is required")
}

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [magicLinkClient()]
})
