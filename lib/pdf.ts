import { PDFParse } from "pdf-parse";

/**
 * Extract plain text from a PDF buffer.
 *
 * Uses pdf-parse v2 (PDFParse class). Returns the concatenated text across
 * all pages. Page-level text is available on the `TextResult` if we need
 * per-page chunking later, but the current chunker works on the flat
 * string.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const parser = new PDFParse({ data: uint8 });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}
