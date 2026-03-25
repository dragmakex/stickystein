import type { Metadata } from "next"
import type { ReactNode } from "react"
import "@/app/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://stickystein.com"),
  title: "Stickystein",
  description: "Ask questions over the Epstein PDFs.",
  applicationName: "Stickystein",
  referrer: "origin-when-cross-origin",
  keywords: ["Stickystein", "Epstein PDFs", "RAG", "citations", "document search"],
  authors: [{ name: "alxstai", url: "https://x.com/alxstai" }],
  creator: "@alxstai",
  publisher: "alxstai",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg"
  },
  openGraph: {
    type: "website",
    url: "https://stickystein.com",
    siteName: "Stickystein",
    title: "Stickystein",
    description: "Ask questions over the Epstein PDFs.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Stickystein"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Stickystein",
    description: "Ask questions over the Epstein PDFs.",
    creator: "@alxstai",
    site: "@alxstai",
    images: ["/twitter-image"]
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="me" href="https://x.com/alxstai" />
      </head>
      <body>{children}</body>
    </html>
  )
}
