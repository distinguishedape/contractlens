import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract plain text from a PDF buffer.
 *
 * Uses `unpdf` — a serverless-friendly fork of pdfjs that runs on Vercel
 * / Cloudflare Workers without needing DOM polyfills or `@napi-rs/canvas`.
 *
 * Previously used `pdf-parse` v2, but it pulls in `pdfjs-dist` which
 * references `DOMMatrix`, `ImageData`, and `Path2D` at module-load time —
 * those classes don't exist in Vercel's Node runtime and the import blows
 * up before any text can be extracted.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}
