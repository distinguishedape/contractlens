# ContractLens — Progress Tracker

## Implementation Order
1. [DONE] Scaffold Next.js + Tailwind + shadcn/ui
2. [ ] Set up Supabase project, enable pgvector, run schema
3. [ ] Build lib/schema.ts, lib/gemini.ts, lib/pdf.ts — verify extraction
4. [ ] Build upload API route
5. [ ] Build home page UI
6. [ ] Build contract detail page UI (without chat)
7. [ ] Add risk flags display
8. [ ] Build embeddings + RAG chat
9. [ ] Build eval suite
10. [ ] Polish UI, write README, deploy

## Current Step: 2 — Supabase + pgvector (PENDING user action)

### Decisions Log
- Stack locked: Next.js 14 App Router, TS strict, Tailwind, shadcn/ui,
  Supabase + pgvector, Gemini (2.0-flash-exp + text-embedding-004),
  pdf-parse, Zod, Vercel AI SDK.
- shadcn/ui installed manually (components.json written, base components
  generated directly). No shadcn CLI invoked to avoid interactive prompts.
- `app/globals.css` uses shadcn HSL CSS variables. Tailwind config
  extended with shadcn tokens + `tailwindcss-animate`.
- `@/*` path alias already in tsconfig.

### Step 1 — Completed
- Installed shadcn deps: class-variance-authority, clsx, tailwind-merge,
  tailwindcss-animate, lucide-react, @radix-ui/react-slot,
  @radix-ui/react-label.
- Configured shadcn: `tailwind.config.ts`, `app/globals.css`,
  `lib/utils.ts`, `components.json`.
- Added base components: `components/ui/{button,card,input,label}.tsx`.
- Replaced default Next.js landing with ContractLens placeholder at
  `app/page.tsx`. Updated `app/layout.tsx` metadata.
- Created `.env.example` with the 4 required vars.
- Verified: `npx next build` passes (static pages generated, no type or
  lint errors).

### Blockers for Step 2
- Needs user to: create a Supabase project, enable the pgvector
  extension, and share the three Supabase env vars + GEMINI_API_KEY
  before the extraction pipeline can be exercised end-to-end.
