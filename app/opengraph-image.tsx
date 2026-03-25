import { ImageResponse } from "next/og"

export const size = {
  width: 1200,
  height: 630
}

export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0f95bd 0%, #0a6fa6 100%)",
          fontFamily: "Tahoma, sans-serif",
          color: "#111"
        }}
      >
        <div
          style={{
            margin: "64px",
            display: "flex",
            flex: 1,
            background: "#c4c0bc",
            borderTop: "4px solid #ffffff",
            borderLeft: "4px solid #ffffff",
            borderRight: "4px solid #404040",
            borderBottom: "4px solid #404040",
            boxShadow: "8px 8px 0 rgba(0, 0, 0, 0.2)",
            flexDirection: "column"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 18px",
              background: "linear-gradient(90deg, #000080, #1084d0)",
              color: "#fff",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.04em"
            }}
          >
            <span>STICKYSTEIN.EXE</span>
            <span style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 24, height: 20, background: "#d8d4d0", border: "2px solid #666" }} />
              <span style={{ width: 24, height: 20, background: "#d8d4d0", border: "2px solid #666" }} />
              <span style={{ width: 24, height: 20, background: "#d8d4d0", border: "2px solid #666" }} />
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "48px",
              textAlign: "center",
              gap: 18
            }}
          >
            <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1 }}>Stickystein</div>
            <div style={{ fontSize: 32, maxWidth: 860, lineHeight: 1.3 }}>
              Ask questions over the Epstein PDFs.
            </div>
            <div style={{ fontSize: 24, color: "#1f4fa8" }}>x.com/alxstai</div>
          </div>
        </div>
      </div>
    ),
    size
  )
}
