import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://contractlens-gamma.vercel.app"),
  title: "ContractLens — AI Contract Intelligence",
  description:
    "Extract structured data and risk flags from contracts and leases using AI. Retry-critique JSON extraction, pgvector RAG with citations, eval suite.",
  openGraph: {
    title: "ContractLens — AI Contract Intelligence",
    description:
      "Upload a lease → structured extraction, risk flags, and RAG chat with citations.",
    url: "https://contractlens-gamma.vercel.app",
    siteName: "ContractLens",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ContractLens — AI Contract Intelligence",
    description:
      "Upload a lease → structured extraction, risk flags, and RAG chat with citations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        {children}
      </body>
    </html>
  );
}
