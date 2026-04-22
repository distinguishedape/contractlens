import { FileText, ShieldAlert, MessageSquare } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="container mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <FileText className="h-4 w-4" />
          <span>ContractLens</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          AI contract intelligence
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Upload a lease or contract PDF and get structured data, risk flags,
          and a chat interface grounded in the document.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3 mb-12">
        <Card>
          <CardHeader>
            <FileText className="h-5 w-5 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Structured extraction</CardTitle>
            <CardDescription>
              Parties, dates, rent, termination — validated with Zod.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <ShieldAlert className="h-5 w-5 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Risk flags</CardTitle>
            <CardDescription>
              Auto-renewal traps, empty termination, high escalation.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <MessageSquare className="h-5 w-5 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Chat with the doc</CardTitle>
            <CardDescription>
              RAG over chunks with citations back to the source.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-1">
            Upload coming in the next step
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            The scaffold is in place. PDF upload, extraction, and the dashboard
            land in subsequent implementation steps.
          </p>
          <Button disabled>Upload PDF</Button>
        </CardContent>
      </Card>
    </main>
  );
}
