/**
 * Eval suite runner.
 *
 * For each sample in evals/samples/ with a matching expected JSON in
 * evals/expected/, runs the extraction pipeline and compares the result
 * against ground truth using compare.ts. Writes a structured report to
 * evals/report.json that the /evals page reads.
 *
 * Usage:
 *   npx tsx evals/run.ts
 *
 * The runner intentionally accepts .txt fixtures (not just PDFs) — the
 * eval focuses on extraction quality, not PDF parsing, and hand-authored
 * .txt is much easier to version-control than synthetic PDFs.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join, extname, basename } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { extractContract } from "../lib/gemini";
import { extractPdfText } from "../lib/pdf";
import { extractionSchema, type ExtractedContract } from "../lib/schema";
import { compareContract, type FieldResult } from "./compare";

const SAMPLES_DIR = resolve(process.cwd(), "evals/samples");
const EXPECTED_DIR = resolve(process.cwd(), "evals/expected");
const REPORT_PATH = resolve(process.cwd(), "evals/report.json");

export type SampleRun = {
  sample: string;
  success: boolean;
  error?: string;
  attempts: number;
  elapsed_ms: number;
  overall: number;
  fields: FieldResult[];
};

export type EvalReport = {
  run_at: string;
  samples_total: number;
  samples_succeeded: number;
  overall_accuracy: number;
  field_accuracy: Record<string, number>;
  runs: SampleRun[];
};

async function loadSampleText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  const buf = await readFile(filePath);
  if (ext === ".pdf") return await extractPdfText(buf);
  return buf.toString("utf-8");
}

async function loadExpected(name: string): Promise<ExtractedContract> {
  const jsonPath = join(EXPECTED_DIR, `${name}.json`);
  const raw = await readFile(jsonPath, "utf-8");
  const parsed = JSON.parse(raw);
  // Validate the fixture itself against the schema so we catch drift early.
  return extractionSchema.parse(parsed);
}

async function runOne(sampleFile: string): Promise<SampleRun> {
  const name = basename(sampleFile, extname(sampleFile));
  const samplePath = join(SAMPLES_DIR, sampleFile);

  console.log(`\n→ ${name}`);
  const start = Date.now();

  try {
    const [text, expected] = await Promise.all([
      loadSampleText(samplePath),
      loadExpected(name),
    ]);

    const result = await extractContract(text);
    const elapsed = Date.now() - start;

    if (!result.success) {
      return {
        sample: name,
        success: false,
        error: result.error,
        attempts: result.attempts.length,
        elapsed_ms: elapsed,
        overall: 0,
        fields: [],
      };
    }

    const { fields, overall } = compareContract(expected, result.data);
    console.log(
      `  ${(overall * 100).toFixed(1)}% overall · ${result.attempts.length} attempt(s) · ${elapsed}ms`
    );
    for (const f of fields) {
      if (!f.match) {
        console.log(`    ✗ ${f.field} (score ${f.score.toFixed(2)})`);
      }
    }

    return {
      sample: name,
      success: true,
      attempts: result.attempts.length,
      elapsed_ms: elapsed,
      overall,
      fields,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR: ${msg}`);
    return {
      sample: name,
      success: false,
      error: msg,
      attempts: 0,
      elapsed_ms: Date.now() - start,
      overall: 0,
      fields: [],
    };
  }
}

function aggregateFieldAccuracy(runs: SampleRun[]): Record<string, number> {
  const totals = new Map<string, { matched: number; count: number }>();
  for (const run of runs) {
    for (const f of run.fields) {
      const t = totals.get(f.field) ?? { matched: 0, count: 0 };
      t.matched += f.match ? 1 : 0;
      t.count += 1;
      totals.set(f.field, t);
    }
  }
  const out: Record<string, number> = {};
  totals.forEach(({ matched, count }, field) => {
    out[field] = count === 0 ? 0 : matched / count;
  });
  return out;
}

export async function runEvals(): Promise<EvalReport> {
  const entries = await readdir(SAMPLES_DIR);
  const samples = entries
    .filter((f) => f.endsWith(".txt") || f.endsWith(".pdf"))
    .sort();

  if (samples.length === 0) {
    throw new Error(`No sample fixtures found in ${SAMPLES_DIR}`);
  }

  console.log(`Running ${samples.length} sample(s)...`);

  const runs: SampleRun[] = [];
  for (const file of samples) {
    runs.push(await runOne(file));
  }

  const succeeded = runs.filter((r) => r.success).length;
  const overall =
    runs.length === 0
      ? 0
      : runs.reduce((s, r) => s + r.overall, 0) / runs.length;

  const report: EvalReport = {
    run_at: new Date().toISOString(),
    samples_total: runs.length,
    samples_succeeded: succeeded,
    overall_accuracy: overall,
    field_accuracy: aggregateFieldAccuracy(runs),
    runs,
  };

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(
    `Overall: ${(overall * 100).toFixed(1)}% · ${succeeded}/${runs.length} samples extracted successfully`
  );

  return report;
}

// Run when invoked directly via `tsx evals/run.ts`. The check compares
// the normalized script path with the entrypoint — works on Windows where
// the import.meta.url URL form can differ from process.argv[1].
const invokedPath = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (invokedPath.endsWith("evals/run.ts") || invokedPath.endsWith("evals/run.js")) {
  runEvals().catch((err) => {
    console.error("Eval run failed:", err);
    process.exit(1);
  });
}
