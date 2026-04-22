import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EvalReport } from "@/evals/run";

/**
 * Serves the most recent eval report written by `npx tsx evals/run.ts`.
 *
 * The eval suite itself is NOT run inside this handler — calling Gemini
 * across five samples takes tens of seconds and burns rate-limit budget
 * on every page refresh. Instead, the runner is a standalone script
 * executed manually (or from CI), and the /evals page reads the cached
 * report.json that the runner wrote to disk.
 */
export async function GET(): Promise<Response> {
  const reportPath = resolve(process.cwd(), "evals/report.json");
  try {
    const raw = await readFile(reportPath, "utf-8");
    const report = JSON.parse(raw) as EvalReport;
    return NextResponse.json(report);
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? (err as { code: string }).code : null;
    if (code === "ENOENT") {
      return NextResponse.json(
        {
          error: "No eval report found",
          hint: "Run `npx tsx evals/run.ts` to generate evals/report.json",
        },
        { status: 404 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to read report", details: msg },
      { status: 500 }
    );
  }
}
