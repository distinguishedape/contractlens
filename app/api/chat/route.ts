import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedText, searchChunks, type RetrievedChunk } from "@/lib/embeddings";

/**
 * RAG chat endpoint.
 *
 * Flow:
 *  1. Embed the user's question.
 *  2. Retrieve the top-3 chunks for this contract (pgvector similarity).
 *  3. Stream a Gemini completion grounded on those chunks.
 *  4. Instruct the model to cite chunks as [chunk N] so the UI can link
 *     back to the exact source text.
 *  5. Return the chunks in the `X-Retrieved-Chunks` header so the client
 *     can render them alongside the streamed answer.
 */

const CHAT_MODEL = "gemini-2.5-flash-lite";

function buildRagSystemPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return `You are a contract analysis assistant. No relevant context was retrieved from the contract for this question. Tell the user you cannot answer from the document and suggest they rephrase or ask something else.`;
  }

  const formatted = chunks
    .map(
      (c, i) =>
        `[chunk ${i + 1}] (chunk_index=${c.chunkIndex}, similarity=${c.similarity.toFixed(3)})\n${c.content}`
    )
    .join("\n\n---\n\n");

  return `You are a contract analysis assistant. Answer the user's question using ONLY the contract excerpts below. If the excerpts do not contain the answer, say so explicitly — do not guess or draw on outside knowledge.

When you make a claim, cite the source chunk in the format [chunk N]. Prefer short, direct answers. If the user asks about dates or amounts, quote the exact language from the excerpt.

CONTRACT EXCERPTS:

${formatted}`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { contractId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contractId = body.contractId;
  const question = body.question?.trim();

  if (!contractId || !question) {
    return NextResponse.json(
      { error: "contractId and question are required" },
      { status: 400 }
    );
  }

  if (question.length > 1000) {
    return NextResponse.json(
      { error: "Question is too long (max 1000 chars)" },
      { status: 400 }
    );
  }

  // ── 1 & 2. Embed the question, retrieve top-3 chunks ─────────────────────
  let chunks: RetrievedChunk[];
  try {
    const queryEmbedding = await embedText(question);
    chunks = await searchChunks(contractId, queryEmbedding, 3);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Retrieval failed";
    return NextResponse.json(
      { error: "Retrieval failed", details: msg },
      { status: 500 }
    );
  }

  // ── 3. Stream grounded answer via Vercel AI SDK ──────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured on the server" },
      { status: 500 }
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google(CHAT_MODEL),
    system: buildRagSystemPrompt(chunks),
    prompt: question,
  });

  // The client reads the X-Retrieved-Chunks header before consuming the
  // body stream, so citations render in parallel with the streamed answer.
  return result.toTextStreamResponse({
    headers: {
      "X-Retrieved-Chunks": encodeURIComponent(JSON.stringify(chunks)),
    },
  });
}
