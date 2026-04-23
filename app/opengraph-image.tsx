import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ContractLens — AI contract intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          color: "white",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#6366f1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 28,
            }}
          >
            CL
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.9 }}>
            ContractLens
          </div>
        </div>

        <div
          style={{
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            marginBottom: 32,
            display: "flex",
          }}
        >
          AI contract intelligence
        </div>

        <div
          style={{
            fontSize: 32,
            lineHeight: 1.3,
            opacity: 0.7,
            maxWidth: 900,
            display: "flex",
          }}
        >
          Upload a lease → structured extraction, risk flags, and RAG chat with
          citations.
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            gap: 24,
            fontSize: 22,
            opacity: 0.55,
          }}
        >
          <span>Next.js 14</span>
          <span>·</span>
          <span>Gemini</span>
          <span>·</span>
          <span>pgvector RAG</span>
          <span>·</span>
          <span>Zod retry-critique</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
