# ContractLens — Progress Tracker

## Implementation Order
1. [DONE] Scaffold Next.js + Tailwind + shadcn/ui
2. [DONE] Set up Supabase project, enable pgvector, run schema
3. [DONE] Build lib/schema.ts, lib/gemini.ts, lib/pdf.ts — verify extraction
4. [ ] Build upload API route
5. [ ] Build home page UI
6. [ ] Build contract detail page UI (without chat)
7. [ ] Add risk flags display
8. [ ] Build embeddings + RAG chat
9. [ ] Build eval suite
10. [ ] Polish UI, write README, deploy

## Current Step: 4 — Upload API route

### Decisions Log
- Stack: Next.js 14 App Router, TS strict, Tailwind, shadcn/ui,
  Supabase + pgvector, Gemini, pdf-parse v2, Zod, Vercel AI SDK.
- **Model swap (deviation from spec):** spec named
  `gemini-2.0-flash-exp`, which Google retired. `gemini-2.0-flash`
  and `gemini-2.0-flash-lite` both return 429 with
  `free_tier_requests limit: 0` on this account. `gemini-2.5-flash`
  returned 503 under load. `gemini-2.5-flash-lite` is reliable and
  strictly newer than what the spec asked for. Name is the only thing
  that needs to change to upgrade later — see the comment at
  `MODEL_NAME` in `lib/gemini.ts`.
- **Embedding model swap (for step 8):** `text-embedding-004` is not
  listed on this API key. Available embedding models are
  `gemini-embedding-001` (default 3072-dim) and
  `gemini-embedding-2-preview`. Plan: use `gemini-embedding-001` with
  `outputDimensionality: 768` to match the existing `vector(768)`
  column.
- pdf-parse v2 API: `new PDFParse({ data }).getText()`. Wrapped in
  `lib/pdf.ts` with `.destroy()` cleanup.
- shadcn/ui installed manually (no CLI).
- `@/*` path alias in tsconfig.
- **Transient-error handling:** the extractor currently fails fast on
  model-call failures (network / 503 / 429). Retry-critique is only
  for schema correctness, not transport. If 503s become routine we
  may want to wrap transport errors with exponential backoff — note
  for step 10 polish.

### Step 1 — Completed
- shadcn/ui configured; base components added; ContractLens placeholder
  at `app/page.tsx`; `.env.example` created; `next build` passes.

### Step 2 — Completed
- Supabase schema applied (`contracts` + `contract_chunks` +
  `ivfflat` index + `contract_chunks(contract_id)` btree index).
- pgvector confirmed enabled.
- Server-only Supabase client at `lib/supabase.ts` using the service
  role key. Row types exported.

### Step 3 — Completed
- `lib/schema.ts`: Zod schema + prompt-facing JSON description +
  `formatZodIssues()` helper. Single source of truth for the shape.
- `lib/pdf.ts`: `extractPdfText(buffer)` using pdf-parse v2.
- `lib/gemini.ts`: `extractContract(documentText, { maxRetries })`
  implementing the retry-critique loop:
  1. First call to Gemini (JSON mode + system instruction).
  2. Parse JSON → log + retry with critique if it fails.
  3. Zod validate → log + retry with field-targeted critique if it
     fails.
  4. Up to 2 retries (3 total attempts). All attempts recorded on the
     returned `attempts` array.
  5. On terminal failure, returns `{ success: false, partial,
     attempts, error }` so callers can surface the last best-effort
     parse.
- `scripts/test-extract.ts` standalone runner. Verified with
  `scripts/sample-lease.txt` (synthetic INR lease). Result: all 10
  top-level fields populated correctly on first attempt, confidence
  "high", zero retries, ~3s elapsed. Pipeline confirmed working
  end-to-end before touching any UI.

### Blockers
- (none) — ready for step 4 (upload API route).

### Known rough edges (flagged for step 10 polish)
- Transport errors bypass retry-critique; wrap with exponential
  backoff once the rest of the app stabilizes.
- Embedding model output-dimensionality must be set to 768 when we
  build `lib/embeddings.ts` in step 8.
