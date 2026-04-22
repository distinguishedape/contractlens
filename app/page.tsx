import Link from "next/link";
import { FileText, Beaker } from "lucide-react";
import { UploadZone } from "@/components/upload-zone";

export default function Home() {
  return (
    <main className="container mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <FileText className="h-4 w-4" />
            ContractLens
          </div>
          <Link
            href="/evals"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Beaker className="h-3.5 w-3.5" />
            Eval results
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          AI contract intelligence
        </h1>
        <p className="text-muted-foreground max-w-lg">
          Upload a lease or contract PDF to extract structured data, surface
          risk flags, and chat with the document.
        </p>
      </header>

      <UploadZone />
    </main>
  );
}
