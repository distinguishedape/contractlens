import { z } from "zod";

/**
 * Canonical Zod schema for extracted contract data.
 *
 * Every field is nullable where the document might omit it — we want the
 * model to return `null` rather than hallucinate a plausible guess. The
 * retry-critique loop in `lib/gemini.ts` uses this schema's error messages
 * to tell the model exactly which fields failed validation.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDateOrNull = z
  .string()
  .regex(ISO_DATE, "Date must be ISO format YYYY-MM-DD")
  .nullable();

const moneyAmount = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1, "Currency code required when amount is present"),
});

export const extractionSchema = z.object({
  parties: z.object({
    landlord: z.string().min(1).nullable(),
    tenant: z.string().min(1).nullable(),
    guarantor: z.string().min(1).nullable(),
  }),
  dates: z.object({
    start_date: isoDateOrNull,
    end_date: isoDateOrNull,
    renewal_notice_deadline: isoDateOrNull,
  }),
  financial_terms: z.object({
    monthly_rent: moneyAmount.nullable(),
    security_deposit: moneyAmount.nullable(),
    rent_escalation: z.object({
      type: z.enum(["percentage", "fixed", "none"]),
      value: z.number().nullable(),
    }),
  }),
  notice_period_days: z.number().int().nonnegative().nullable(),
  termination_conditions: z.array(z.string().min(1)),
  auto_renewal: z.object({
    enabled: z.boolean(),
    terms: z.string().nullable(),
  }),
  governing_law: z.string().nullable(),
  extraction_confidence: z.enum(["high", "medium", "low"]),
  ambiguities: z.array(z.string().min(1)),
});

export type ExtractedContract = z.infer<typeof extractionSchema>;

/**
 * Human-readable JSON shape we give to the model in the system prompt.
 * Kept as a single source of truth so the schema and the prompt can never
 * drift. Must stay in sync with `extractionSchema` above.
 */
export const schemaDescriptionForPrompt = `{
  "parties": {
    "landlord": string | null,
    "tenant": string | null,
    "guarantor": string | null
  },
  "dates": {
    "start_date": "YYYY-MM-DD" | null,
    "end_date": "YYYY-MM-DD" | null,
    "renewal_notice_deadline": "YYYY-MM-DD" | null
  },
  "financial_terms": {
    "monthly_rent": { "amount": number, "currency": string } | null,
    "security_deposit": { "amount": number, "currency": string } | null,
    "rent_escalation": {
      "type": "percentage" | "fixed" | "none",
      "value": number | null
    }
  },
  "notice_period_days": number | null,
  "termination_conditions": string[],
  "auto_renewal": {
    "enabled": boolean,
    "terms": string | null
  },
  "governing_law": string | null,
  "extraction_confidence": "high" | "medium" | "low",
  "ambiguities": string[]
}`;

/**
 * Formats a ZodError into a compact, model-friendly list of field errors.
 * This string is injected into the retry prompt so the model can target
 * only the fields that failed.
 */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
