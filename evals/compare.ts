import { type ExtractedContract } from "../lib/schema";

/**
 * Per-field comparison for the eval suite.
 *
 * Comparison strategy:
 *   - Scalars (numbers, booleans, enums): strict equality.
 *   - Dates (ISO YYYY-MM-DD): parse to Date and compare getTime().
 *   - Strings: Levenshtein similarity >= 0.85 (tolerates casing / whitespace
 *     / small paraphrasing differences from the model).
 *   - String arrays (termination_conditions): set-style F1 — every expected
 *     item must fuzzy-match some actual item and vice-versa.
 *
 * `extraction_confidence` and `ambiguities` are intentionally excluded from
 * accuracy scoring: they're model self-reports rather than ground truth.
 */

export const FUZZY_THRESHOLD = 0.85;

// ─── Levenshtein ──────────────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a.toLowerCase().trim(), b.toLowerCase().trim()) / max;
}

function datesEqual(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return false;
  return da === db;
}

function stringFieldMatch(a: string | null, b: string | null): {
  match: boolean;
  similarity: number;
} {
  if (a === b) return { match: true, similarity: 1 };
  if (a === null || b === null) return { match: false, similarity: 0 };
  const sim = stringSimilarity(a, b);
  return { match: sim >= FUZZY_THRESHOLD, similarity: sim };
}

/** Bipartite-ish set matching for string arrays. Each expected item is
 *  paired greedily with its best unclaimed actual item. F1 from there. */
function arrayF1(expected: string[], actual: string[]): number {
  if (expected.length === 0 && actual.length === 0) return 1;
  if (expected.length === 0 || actual.length === 0) return 0;

  const actualTaken = new Array<boolean>(actual.length).fill(false);
  let tp = 0;

  for (const exp of expected) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < actual.length; i++) {
      if (actualTaken[i]) continue;
      const sim = stringSimilarity(exp, actual[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestSim >= FUZZY_THRESHOLD) {
      actualTaken[bestIdx] = true;
      tp++;
    }
  }

  const precision = tp / actual.length;
  const recall = tp / expected.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ─── Per-field comparator ─────────────────────────────────────────────────────

export type FieldResult = {
  field: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
  score: number; // 0–1 (1 = exact, fuzzy for strings, F1 for arrays)
};

export function compareContract(
  expected: ExtractedContract,
  actual: ExtractedContract
): { fields: FieldResult[]; overall: number } {
  const fields: FieldResult[] = [];

  const push = (
    field: string,
    exp: unknown,
    act: unknown,
    match: boolean,
    score: number
  ) => {
    fields.push({ field, expected: exp, actual: act, match, score });
  };

  // strings (names, governing law, auto_renewal terms)
  const sField = (path: string, exp: string | null, act: string | null) => {
    const r = stringFieldMatch(exp, act);
    push(path, exp, act, r.match, r.similarity);
  };

  sField("parties.landlord", expected.parties.landlord, actual.parties.landlord);
  sField("parties.tenant", expected.parties.tenant, actual.parties.tenant);
  sField("parties.guarantor", expected.parties.guarantor, actual.parties.guarantor);

  // dates
  const dField = (path: string, exp: string | null, act: string | null) => {
    const match = datesEqual(exp, act);
    push(path, exp, act, match, match ? 1 : 0);
  };
  dField("dates.start_date", expected.dates.start_date, actual.dates.start_date);
  dField("dates.end_date", expected.dates.end_date, actual.dates.end_date);
  dField(
    "dates.renewal_notice_deadline",
    expected.dates.renewal_notice_deadline,
    actual.dates.renewal_notice_deadline
  );

  // money (nullable objects)
  const mField = (
    path: string,
    exp: { amount: number; currency: string } | null,
    act: { amount: number; currency: string } | null
  ) => {
    if (exp === act) {
      push(path, exp, act, true, 1);
      return;
    }
    if (exp === null || act === null) {
      push(path, exp, act, false, 0);
      return;
    }
    const amtMatch = exp.amount === act.amount;
    const curMatch = exp.currency.toUpperCase() === act.currency.toUpperCase();
    push(path, exp, act, amtMatch && curMatch, amtMatch && curMatch ? 1 : 0);
  };

  mField(
    "financial_terms.monthly_rent",
    expected.financial_terms.monthly_rent,
    actual.financial_terms.monthly_rent
  );
  mField(
    "financial_terms.security_deposit",
    expected.financial_terms.security_deposit,
    actual.financial_terms.security_deposit
  );

  // escalation
  {
    const exp = expected.financial_terms.rent_escalation;
    const act = actual.financial_terms.rent_escalation;
    const typeMatch = exp.type === act.type;
    const valueMatch = exp.value === act.value;
    const match = typeMatch && valueMatch;
    push("financial_terms.rent_escalation", exp, act, match, match ? 1 : 0);
  }

  // notice period
  {
    const match = expected.notice_period_days === actual.notice_period_days;
    push(
      "notice_period_days",
      expected.notice_period_days,
      actual.notice_period_days,
      match,
      match ? 1 : 0
    );
  }

  // termination conditions (array)
  {
    const score = arrayF1(
      expected.termination_conditions,
      actual.termination_conditions
    );
    push(
      "termination_conditions",
      expected.termination_conditions,
      actual.termination_conditions,
      score >= FUZZY_THRESHOLD,
      score
    );
  }

  // auto renewal
  {
    const enabledMatch = expected.auto_renewal.enabled === actual.auto_renewal.enabled;
    push(
      "auto_renewal.enabled",
      expected.auto_renewal.enabled,
      actual.auto_renewal.enabled,
      enabledMatch,
      enabledMatch ? 1 : 0
    );
    sField(
      "auto_renewal.terms",
      expected.auto_renewal.terms,
      actual.auto_renewal.terms
    );
  }

  sField("governing_law", expected.governing_law, actual.governing_law);

  const matched = fields.filter((f) => f.match).length;
  const overall = fields.length === 0 ? 0 : matched / fields.length;
  return { fields, overall };
}
