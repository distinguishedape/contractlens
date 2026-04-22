import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  DollarSign,
  Users,
  FileText,
  RefreshCw,
} from "lucide-react";
import { getServerSupabase } from "@/lib/supabase";
import { type ExtractedContract } from "@/lib/schema";
import { type RiskFlag } from "@/lib/risk-flags";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContractChat } from "@/components/contract-chat";

type ContractRow = {
  id: string;
  filename: string;
  uploaded_at: string;
  extracted_data: ExtractedContract;
  risk_flags: RiskFlag[];
};

async function getContract(id: string): Promise<ContractRow | null> {
  const db = getServerSupabase();
  const { data, error } = await db
    .from("contracts")
    .select("id, filename, uploaded_at, extracted_data, risk_flags")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as ContractRow;
}

// ── Small display helpers ─────────────────────────────────────────────────────

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value ?? <NullValue />}</dd>
    </div>
  );
}

function NullValue() {
  return <span className="text-muted-foreground italic">Not specified</span>;
}

function Money({
  value,
}: {
  value: { amount: number; currency: string } | null;
}) {
  if (!value) return <NullValue />;
  return (
    <span>
      {value.currency} {value.amount.toLocaleString()}
    </span>
  );
}

function RiskCard({ flag }: { flag: RiskFlag }) {
  const colours = {
    red: "border-red-200 bg-red-50",
    yellow: "border-yellow-200 bg-yellow-50",
    green: "border-green-200 bg-green-50",
  };
  const iconColours = {
    red: "text-red-500",
    yellow: "text-yellow-500",
    green: "text-green-600",
  };
  const Icon =
    flag.level === "red"
      ? ShieldAlert
      : flag.level === "yellow"
        ? AlertTriangle
        : ShieldCheck;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${colours[flag.level]}`}
    >
      <Icon
        className={`mt-0.5 h-5 w-5 shrink-0 ${iconColours[flag.level]}`}
      />
      <div>
        <p className="text-sm font-medium leading-snug">{flag.message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{flag.field}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ContractPage({
  params,
}: {
  params: { id: string };
}) {
  const contract = await getContract(params.id);
  if (!contract) notFound();

  const ex = contract.extracted_data;
  const flags = contract.risk_flags;
  const nonGreenFlags = flags.filter((f) => f.level !== "green");

  return (
    <main className="container mx-auto max-w-5xl px-6 py-10">
      {/* Back + header */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        All contracts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {contract.filename}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Uploaded {new Date(contract.uploaded_at).toLocaleString()} ·{" "}
            <span className="capitalize">{ex.extraction_confidence} confidence</span>
          </p>
        </div>
        <Badge
          variant={
            flags.some((f) => f.level === "red")
              ? "red"
              : flags.some((f) => f.level === "yellow")
                ? "yellow"
                : "green"
          }
          className="text-sm px-3 py-1"
        >
          {flags.some((f) => f.level === "red")
            ? "High risk"
            : flags.some((f) => f.level === "yellow")
              ? "Medium risk"
              : "Low risk"}
        </Badge>
      </div>

      {/* Risk flags */}
      {nonGreenFlags.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Risk flags
          </h2>
          <div className="space-y-2">
            {nonGreenFlags.map((flag, i) => (
              <RiskCard key={i} flag={flag} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parties */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Parties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Landlord" value={ex.parties.landlord} />
              <Field label="Tenant" value={ex.parties.tenant} />
              <Field label="Guarantor" value={ex.parties.guarantor} />
            </dl>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Key dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field label="Start date" value={ex.dates.start_date} />
              <Field label="End date" value={ex.dates.end_date} />
              <Field
                label="Renewal notice deadline"
                value={ex.dates.renewal_notice_deadline}
              />
              <Field
                label="Notice period"
                value={
                  ex.notice_period_days != null
                    ? `${ex.notice_period_days} days`
                    : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        {/* Financial */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Financial terms
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field
                label="Monthly rent"
                value={<Money value={ex.financial_terms.monthly_rent} />}
              />
              <Field
                label="Security deposit"
                value={<Money value={ex.financial_terms.security_deposit} />}
              />
              <Field
                label="Rent escalation"
                value={
                  ex.financial_terms.rent_escalation.type === "none"
                    ? "None"
                    : ex.financial_terms.rent_escalation.value != null
                      ? `${ex.financial_terms.rent_escalation.value}${ex.financial_terms.rent_escalation.type === "percentage" ? "%" : " (fixed)"} per renewal`
                      : ex.financial_terms.rent_escalation.type
                }
              />
            </dl>
          </CardContent>
        </Card>

        {/* Renewal & governing law */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Renewal & jurisdiction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Field
                label="Auto-renewal"
                value={ex.auto_renewal.enabled ? "Yes" : "No"}
              />
              {ex.auto_renewal.enabled && ex.auto_renewal.terms && (
                <Field label="Renewal terms" value={ex.auto_renewal.terms} />
              )}
              <Field label="Governing law" value={ex.governing_law} />
            </dl>
          </CardContent>
        </Card>

        {/* Termination */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Termination conditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ex.termination_conditions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No termination conditions found.
              </p>
            ) : (
              <ul className="space-y-1.5 list-disc list-inside">
                {ex.termination_conditions.map((cond, i) => (
                  <li key={i} className="text-sm">
                    {cond}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Ambiguities */}
        {ex.ambiguities.length > 0 && (
          <Card className="lg:col-span-2 border-yellow-200 bg-yellow-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="h-4 w-4" /> Flags for review (
                {ex.ambiguities.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 list-disc list-inside">
                {ex.ambiguities.map((a, i) => (
                  <li key={i} className="text-sm">
                    {a}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <section className="mt-8">
        <ContractChat contractId={contract.id} />
      </section>
    </main>
  );
}
