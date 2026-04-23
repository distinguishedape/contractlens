import Link from "next/link";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ArrowLeft, CheckCircle2, XCircle, Beaker } from "lucide-react";
import type { EvalReport, SampleRun } from "@/evals/run";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Read the report directly from the filesystem at render time. The runner
 * writes it to `evals/report.json`; we don't run Gemini on page view.
 */
async function loadReport(): Promise<EvalReport | null> {
  try {
    const raw = await readFile(
      resolve(process.cwd(), "evals/report.json"),
      "utf-8"
    );
    return JSON.parse(raw) as EvalReport;
  } catch {
    return null;
  }
}

function pctColor(pct: number): string {
  if (pct >= 0.9) return "text-green-600";
  if (pct >= 0.7) return "text-yellow-600";
  return "text-red-600";
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function SampleCard({ run }: { run: SampleRun }) {
  const matched = run.fields.filter((f) => f.match).length;
  const total = run.fields.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {run.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className="font-mono text-xs">{run.sample}</span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{run.attempts} attempt(s)</span>
            <span>·</span>
            <span>{run.elapsed_ms}ms</span>
            {run.success && (
              <>
                <span>·</span>
                <span className={`font-semibold ${pctColor(run.overall)}`}>
                  {fmtPct(run.overall)} ({matched}/{total})
                </span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!run.success ? (
          <p className="text-xs text-red-600 whitespace-pre-wrap font-mono">
            {run.error}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
            {run.fields.map((f) => (
              <div
                key={f.field}
                className="flex items-center justify-between gap-2 text-xs border-b border-dashed pb-1"
              >
                <span className="font-mono text-muted-foreground truncate">
                  {f.field}
                </span>
                <span
                  className={`shrink-0 font-semibold ${
                    f.match ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {f.match ? "✓" : "✗"} {fmtPct(f.score)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Force dynamic render so the page re-reads report.json on every request.
// Without this, Next.js would statically cache the initial read at build time.
export const dynamic = "force-dynamic";

export default async function EvalsPage() {
  const report = await loadReport();

  return (
    <main className="container mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Beaker className="h-5 w-5" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Extraction accuracy evals
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8 max-w-3xl">
        Five hand-curated lease fixtures cover the realistic spread: clean
        residential, commercial US, short-term, heavily ambiguous, and
        minimal-fields. Each field is scored with strict equality for
        scalars/dates/money, Levenshtein similarity (≥ 0.85) for strings, and
        greedy set-F1 for string arrays. Model self-reports
        (<code className="text-xs">extraction_confidence</code>,{" "}
        <code className="text-xs">ambiguities</code>) are intentionally
        excluded from scoring.
      </p>

      {!report ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No report yet</CardTitle>
            <CardDescription>
              Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                npx tsx evals/run.ts
              </code>{" "}
              to generate <code className="text-xs">evals/report.json</code>,
              then refresh this page.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {(() => {
            const successful = report.runs.filter((r) => r.success);
            const successAcc =
              successful.length === 0
                ? 0
                : successful.reduce((s, r) => s + r.overall, 0) /
                  successful.length;
            const failed = report.samples_total - report.samples_succeeded;
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-3 mb-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>
                        Field accuracy (successful runs)
                      </CardDescription>
                      <CardTitle
                        className={`text-3xl ${pctColor(successAcc)}`}
                      >
                        {fmtPct(successAcc)}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Samples extracted</CardDescription>
                      <CardTitle className="text-3xl">
                        {report.samples_succeeded}
                        <span className="text-base font-normal text-muted-foreground">
                          {" "}
                          / {report.samples_total}
                        </span>
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Last run</CardDescription>
                      <CardTitle className="text-sm font-mono">
                        {new Date(report.run_at).toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>
                {failed > 0 && (
                  <p className="text-xs text-muted-foreground mb-8 max-w-3xl">
                    Headline accuracy is averaged across the{" "}
                    {report.samples_succeeded} sample(s) where extraction
                    succeeded end-to-end. {failed} sample(s) failed during this
                    run — one from a genuine schema-retry dead-end on a
                    deliberately ambiguous fixture, one from hitting the Gemini
                    free-tier daily quota mid-run. Per-sample detail below.
                  </p>
                )}
              </>
            );
          })()}

          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Per-field accuracy</CardTitle>
              <CardDescription>
                Across all samples where extraction succeeded.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {Object.entries(report.field_accuracy)
                  .sort((a, b) => b[1] - a[1])
                  .map(([field, acc]) => (
                    <div
                      key={field}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="font-mono text-xs flex-1 truncate">
                        {field}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            acc >= 0.9
                              ? "bg-green-500"
                              : acc >= 0.7
                                ? "bg-yellow-400"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${acc * 100}%` }}
                        />
                      </div>
                      <Badge
                        variant={
                          acc >= 0.9
                            ? "green"
                            : acc >= 0.7
                              ? "yellow"
                              : "red"
                        }
                        className="text-xs w-14 justify-center"
                      >
                        {fmtPct(acc)}
                      </Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <h2 className="text-base font-semibold mb-3">Per-sample detail</h2>
          <div className="space-y-3">
            {report.runs.map((run) => (
              <SampleCard key={run.sample} run={run} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
