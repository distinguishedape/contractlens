import { GoogleGenerativeAI } from "@google/generative-ai";
import { getServerSupabase } from "./supabase";

/**
 * Text chunking and vector embedding pipeline.
 *
 * Chunking strategy: character-based sliding window.
 *   ~2000 chars ≈ 500 tokens (at ~4 chars/token for English legal text)
 *   ~200 chars overlap ≈ 50 tokens
 *
 * This keeps each chunk within a tight context window for retrieval while
 * the overlap ensures a clause split across a boundary still appears in
 * full in at least one of the two neighbouring chunks.
 *
 * Embedding model: gemini-embedding-001 with outputDimensionality=768.
 * The spec named text-embedding-004, which is unavailable on this API key.
 * gemini-embedding-001 with outputDimensionality:768 produces a
 * dimensionally-identical vector and slots into the existing vector(768)
 * column with no schema change.
 */

const EMBEDDING_MODEL = "gemini-embedding-001";
const CHUNK_SIZE = 2000;   // chars ≈ 500 tokens
const CHUNK_OVERLAP = 200; // chars ≈ 50 tokens

export type Chunk = {
  chunkIndex: number;
  content: string;
};

/** Split document text into overlapping chunks. */
export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({ chunkIndex: index++, content: text.slice(start, end) });
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/** Embed a single text string. Returns a 768-dim float array. */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const result = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    // @ts-expect-error — outputDimensionality is supported by the REST API
    // but not yet typed in the @google/generative-ai SDK (v0.24.x). It
    // controls the vector size; 768 matches our pgvector column.
    outputDimensionality: 768,
  });

  return result.embedding.values;
}

export type RetrievedChunk = {
  id: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

/**
 * Retrieve the top-K most similar chunks for a contract given a query
 * embedding. Uses the `match_contract_chunks` RPC which encapsulates the
 * pgvector cosine similarity search — PostgREST can't invoke the `<=>`
 * operator directly, so the RPC is the clean bridge.
 */
export async function searchChunks(
  contractId: string,
  queryEmbedding: number[],
  topK: number = 3
): Promise<RetrievedChunk[]> {
  const db = getServerSupabase();
  const { data, error } = await db.rpc("match_contract_chunks", {
    query_embedding: queryEmbedding,
    match_contract_id: contractId,
    match_count: topK,
  });
  if (error) throw new Error(`Vector search failed: ${error.message}`);
  type Row = {
    id: string;
    chunk_index: number;
    content: string;
    similarity: number;
  };
  return (data ?? []).map((row: Row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    content: row.content,
    similarity: row.similarity,
  }));
}

/**
 * Embed all chunks for a contract and upsert them into contract_chunks.
 * Chunks are embedded one at a time (free-tier rate limit is 1500 RPM,
 * but to be safe we don't parallelise aggressively). Each failure is
 * logged but doesn't abort the whole batch — partial embeddings are
 * better than none for RAG.
 */
export async function embedAndStoreChunks(
  contractId: string,
  chunks: Chunk[]
): Promise<{ stored: number; failed: number }> {
  const db = getServerSupabase();
  let stored = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await embedText(chunk.content);
      const { error } = await db.from("contract_chunks").insert({
        contract_id: contractId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        embedding,
      });
      if (error) throw new Error(error.message);
      stored++;
    } catch (err) {
      console.error(
        `Failed to embed chunk ${chunk.chunkIndex} for contract ${contractId}:`,
        err
      );
      failed++;
    }
  }

  return { stored, failed };
}
