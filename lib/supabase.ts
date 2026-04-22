import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — never import this into client components.
 * All writes (contracts + chunks) and all privileged reads go through here.
 */
let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (serverClient) return serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server."
    );
  }

  serverClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

/**
 * Row shapes matching the Supabase schema.
 * `extracted_data` and `risk_flags` are stored as jsonb; typed at the
 * call site so the DB layer stays schema-agnostic.
 */
export type ContractRow = {
  id: string;
  filename: string;
  uploaded_at: string;
  raw_text: string;
  extracted_data: unknown;
  risk_flags: unknown;
};

export type ContractChunkRow = {
  id: string;
  contract_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
};
