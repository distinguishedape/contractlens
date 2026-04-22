import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf";
import { extractContract } from "@/lib/gemini";
import { computeRiskFlags } from "@/lib/risk-flags";
import { chunkText, embedAndStoreChunks } from "@/lib/embeddings";
import { getServerSupabase } from "@/lib/supabase";

// Vercel Hobby allows up to 60s for serverless functions. Gemini extraction
// with retries can take 15–25s, so we need to declare this explicitly —
// the default on some Vercel versions is 10s which cuts the request short.
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

type UploadError = {
  error: string;
  details?: string;
};

async function handleUpload(req: Request): Promise<NextResponse> {
  // ── 0. Fail fast if required env vars are missing ────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json<UploadError>(
      { error: "Server misconfiguration", details: "GEMINI_API_KEY is not set" },
      { status: 500 }
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json<UploadError>(
      { error: "Server misconfiguration", details: "Supabase env vars are not set" },
      { status: 500 }
    );
  }

  // ── 1. Parse the multipart form ──────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json<UploadError>(
      { error: "Invalid request", details: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json<UploadError>(
      { error: "Missing file", details: "Include a PDF as the 'file' field" },
      { status: 400 }
    );
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json<UploadError>(
      { error: "Invalid file type", details: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json<UploadError>(
      {
        error: "File too large",
        details: `Maximum allowed size is 10 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      },
      { status: 413 }
    );
  }

  // ── 2. Extract text from the PDF ─────────────────────────────────────────
  let rawText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rawText = await extractPdfText(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<UploadError>(
      { error: "PDF parsing failed", details: msg },
      { status: 422 }
    );
  }

  if (rawText.trim().length < 100) {
    return NextResponse.json<UploadError>(
      {
        error: "PDF appears empty or unreadable",
        details:
          "Less than 100 characters were extracted. The file may be scanned or image-based.",
      },
      { status: 422 }
    );
  }

  // ── 3. Run AI extraction with retry-critique loop ────────────────────────
  const extractionResult = await extractContract(rawText);

  if (!extractionResult.success) {
    return NextResponse.json(
      {
        error: "Extraction failed",
        details: extractionResult.error,
        partial: extractionResult.partial,
        attempts: extractionResult.attempts.length,
      },
      { status: 422 }
    );
  }

  const extractedData = extractionResult.data;

  // ── 4. Compute risk flags ─────────────────────────────────────────────────
  const riskFlags = computeRiskFlags(extractedData);

  // ── 5. Persist to Supabase ────────────────────────────────────────────────
  const db = getServerSupabase();

  const { data: contractRow, error: insertError } = await db
    .from("contracts")
    .insert({
      filename: file.name,
      raw_text: rawText,
      extracted_data: extractedData,
      risk_flags: riskFlags,
    })
    .select("id")
    .single();

  if (insertError || !contractRow) {
    return NextResponse.json<UploadError>(
      {
        error: "Database insert failed",
        details: insertError?.message ?? "No row returned",
      },
      { status: 500 }
    );
  }

  const contractId: string = contractRow.id;

  // ── 6. Chunk + embed (non-blocking — failures don't kill the response) ───
  const chunks = chunkText(rawText);
  embedAndStoreChunks(contractId, chunks).catch((err) => {
    console.error("Background embedding failed for contract", contractId, err);
  });

  // ── 7. Return the contract ID so the client can redirect ──────────────────
  return NextResponse.json({ id: contractId }, { status: 201 });
}

// Top-level safety net: any uncaught throw returns JSON (not an HTML error
// page), so the client always gets a readable error message.
export async function POST(req: Request): Promise<NextResponse> {
  try {
    return await handleUpload(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] unhandled error:", err);
    return NextResponse.json<UploadError>(
      { error: "Unexpected server error", details: msg },
      { status: 500 }
    );
  }
}
