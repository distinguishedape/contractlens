import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type GenerationConfig,
} from "@google/generative-ai";
import {
  extractionSchema,
  formatZodIssues,
  schemaDescriptionForPrompt,
  type ExtractedContract,
} from "./schema";

/**
 * =============================================================================
 *  Contract extraction with a retry-critique loop.
 * =============================================================================
 *
 *  The engineering centerpiece of ContractLens. Pipeline:
 *
 *   1. First call to Gemini with the full system prompt + contract text,
 *      asking for JSON that matches the canonical schema.
 *   2. Parse the response as JSON. If that fails, we have a raw-text error.
 *   3. Validate with Zod. If that fails, we have a structural/field error.
 *   4. On either failure, re-prompt Gemini with a targeted critique:
 *        - the raw response we received
 *        - the *specific* parse or validation errors
 *        - an instruction to fix only those fields and return the full JSON
 *   5. Up to `maxRetries` retries (default 2, so 3 total attempts).
 *   6. If all attempts fail, return the last partially-valid object if we
 *      have one, with an `error` flag so the caller can surface it.
 *
 *  Every attempt is recorded in the returned `attempts` array — prompt sent,
 *  raw response, parse/validation error. This makes debugging a bad run
 *  possible without re-running the model, and gives the UI something to
 *  show when extraction is flaky.
 * =============================================================================
 */

// Spec called for `gemini-2.0-flash-exp`, but Google retired the -exp preview
// line. The 2.0-flash stable models are gated to paid quota on new projects
// (429 with `free_tier_requests limit: 0`), and `gemini-2.5-flash` has been
// returning 503 "high demand" on free-tier calls. `gemini-2.5-flash-lite`
// is the currently-reliable free-tier model — same JSON mode, same
// system-instruction support. We can upgrade to 2.5-flash once capacity
// stabilizes; the model name is the only thing that needs to change.
const MODEL_NAME = "gemini-2.5-flash-lite";
const DEFAULT_MAX_RETRIES = 2;

/** Prevents pathological contexts from blowing up latency / cost.
 *  ~60k chars is well under Gemini 2.0 Flash's 1M-token window but large
 *  enough for any normal lease we'd realistically see. */
const MAX_DOCUMENT_CHARS = 60_000;

export type ExtractAttempt = {
  attempt: number;
  promptPreview: string;
  rawResponse: string | null;
  parsedJson: unknown;
  error: string | null;
};

export type ExtractionSuccess = {
  success: true;
  data: ExtractedContract;
  attempts: ExtractAttempt[];
};

export type ExtractionFailure = {
  success: false;
  /** Best-effort partial JSON from the last attempt (may still be useful). */
  partial: unknown | null;
  attempts: ExtractAttempt[];
  error: string;
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/** Single source of truth for the extraction system prompt. */
function buildSystemPrompt(): string {
  return `You are a legal contract extraction specialist. You extract structured data from lease and contract documents.

STRICT RULES:
1. Extract ONLY information explicitly stated in the document. Never infer, assume, or guess.
2. If a field is not stated or is unclear, return null for that field. Do not fabricate values.
3. Normalize all dates to ISO format YYYY-MM-DD. If a date is ambiguous (e.g., "1/2/2025" with unclear locale), put it in the ambiguities array and set the field to null.
4. For monetary amounts, always include a currency code (USD, INR, EUR, GBP, etc.). If the currency is not stated, treat the amount as unknown and return null.
5. Add an entry to the "ambiguities" array for any clause that is unclear, contradictory, references an external schedule, or could be interpreted multiple ways.
6. Set "extraction_confidence" based on document clarity:
   - "high": document is clear, most fields extracted with confidence
   - "medium": some fields missing or require interpretation
   - "low": document is unclear, poorly formatted, or mostly non-extractable
7. Return ONLY valid JSON matching the schema below. No prose, no markdown fences, no commentary.

SCHEMA (return valid JSON matching this exact shape):
${schemaDescriptionForPrompt}`;
}

function buildInitialUserPrompt(documentText: string): string {
  const truncated = documentText.slice(0, MAX_DOCUMENT_CHARS);
  const truncationNotice =
    documentText.length > MAX_DOCUMENT_CHARS
      ? `\n\n[NOTE: document was truncated from ${documentText.length} to ${MAX_DOCUMENT_CHARS} characters. Flag this in ambiguities.]`
      : "";
  return `Extract the structured data from the following contract. Return only JSON.

--- CONTRACT TEXT ---
${truncated}
--- END CONTRACT TEXT ---${truncationNotice}`;
}

/** Builds the critique prompt used on retry attempts. Targets only the
 *  failing fields so the model isn't re-doing work that already validated. */
function buildCritiquePrompt(
  priorResponse: string,
  errorDescription: string
): string {
  return `Your previous response did not match the required schema. Here is the response you gave:

--- YOUR PREVIOUS RESPONSE ---
${priorResponse}
--- END PREVIOUS RESPONSE ---

The following problems were found:

${errorDescription}

Return a corrected JSON object. Fix ONLY the fields listed above. Keep the other fields exactly as you had them. Return only JSON — no prose, no markdown fences.`;
}

/** Strips accidental markdown fences (e.g. ```json ... ```) the model
 *  sometimes adds despite being told not to. */
function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(stripJsonFences(raw)) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `JSON parse error: ${msg}` };
  }
}

function getModel(): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (dev) or the Vercel project env (prod)."
    );
  }
  const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    temperature: 0.1, // low — this is extraction, not creative writing
  };
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: MODEL_NAME,
    generationConfig,
    systemInstruction: buildSystemPrompt(),
  });
}

/**
 * Run one attempt against the model and return the raw text response.
 * Wrapped so the retry loop can stay focused on its own logic.
 */
async function runSingleCall(
  model: GenerativeModel,
  userPrompt: string
): Promise<string> {
  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

export async function extractContract(
  documentText: string,
  options?: { maxRetries?: number }
): Promise<ExtractionResult> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const attempts: ExtractAttempt[] = [];
  const model = getModel();

  let userPrompt = buildInitialUserPrompt(documentText);
  let lastParsed: unknown = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const record: ExtractAttempt = {
      attempt,
      promptPreview: userPrompt.slice(0, 240),
      rawResponse: null,
      parsedJson: null,
      error: null,
    };

    let rawResponse: string;
    try {
      rawResponse = await runSingleCall(model, userPrompt);
      record.rawResponse = rawResponse;
    } catch (err) {
      // Network / quota / safety block — no response to critique against,
      // so we fail fast rather than looping.
      record.error =
        err instanceof Error ? `Model call failed: ${err.message}` : "Model call failed";
      attempts.push(record);
      return {
        success: false,
        partial: lastParsed,
        attempts,
        error: record.error,
      };
    }

    // Step 1: parse JSON
    const parseResult = safeParseJson(rawResponse);
    if (!parseResult.ok) {
      record.error = parseResult.error;
      attempts.push(record);
      if (attempt > maxRetries) break;
      userPrompt = buildCritiquePrompt(rawResponse, parseResult.error);
      continue;
    }
    record.parsedJson = parseResult.value;
    lastParsed = parseResult.value;

    // Step 2: validate with Zod
    const validation = extractionSchema.safeParse(parseResult.value);
    if (validation.success) {
      attempts.push(record);
      return { success: true, data: validation.data, attempts };
    }

    const errorDescription = formatZodIssues(validation.error);
    record.error = `Schema validation failed:\n${errorDescription}`;
    attempts.push(record);

    if (attempt > maxRetries) break;
    userPrompt = buildCritiquePrompt(rawResponse, errorDescription);
  }

  return {
    success: false,
    partial: lastParsed,
    attempts,
    error: attempts[attempts.length - 1]?.error ?? "Extraction failed",
  };
}
