import Link from "next/link";
import { FileText } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase";
import { topRiskLevel, type RiskFlag } from "@/lib/risk-flags";
import { UploadZone } from "@/components/upload-zone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ContractListItem = {
  id: string;
  filename: string;
  uploaded_at: string;
  risk_flags: RiskFlag[];
};

async function getContracts(): Promise<ContractListItem[]> {
  try {
    const db = getServerSupabase();
    const { data, error } = await db
      .from("contracts")
      .select("id, filename, uploaded_at, risk_flags")
      .order("uploaded_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data ?? []) as ContractListItem[];
  } catch {
    return [];
  }
}

function RiskDot({ level }: { level: "red" | "yellow" | "green" }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        level === "red"
          ? "bg-red-500"
          : level === "yellow"
            ? "bg-yellow-400"
            : "bg-green-500"
      }`}
      aria-label={`${level} risk`}
    />
  );
}

export default async function Home() {
  const contracts = await getContracts();

  return (
    <main className="container mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-sm font-medium text-primary mb-3">
          <FileText className="h-4 w-4" />
          ContractLens
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          AI contract intelligence
        </h1>
        <p className="text-muted-foreground max-w-lg">
          Upload a lease or contract PDF to extract structured data, surface
          risk flags, and chat with the document.
        </p>
      </header>

      <section className="mb-10">
        <UploadZone />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">
          {contracts.length > 0 ? "Previous contracts" : ""}
        </h2>

        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">No contracts uploaded yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {contracts.map((c) => {
              const level = topRiskLevel(c.risk_flags);
              return (
                <li key={c.id}>
                  <Link
                    href={`/contract/${c.id}`}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <RiskDot level={level} />
                      <span className="truncate text-sm font-medium">
                        {c.filename}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <Badge
                        variant={level}
                        className="capitalize hidden sm:inline-flex"
                      >
                        {level} risk
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
