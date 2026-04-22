"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type UploadState =
  | { status: "idle" }
  | { status: "dragging" }
  | { status: "uploading"; filename: string }
  | { status: "error"; message: string };

export function UploadZone() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ status: "idle" });

  const upload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setState({ status: "error", message: "Only PDF files are accepted." });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setState({ status: "error", message: "File must be under 10 MB." });
        return;
      }

      setState({ status: "uploading", filename: file.name });

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();

        if (!res.ok) {
          setState({
            status: "error",
            message: json.details ?? json.error ?? "Upload failed.",
          });
          return;
        }

        router.push(`/contract/${json.id}`);
      } catch {
        setState({ status: "error", message: "Network error. Please try again." });
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
      e.target.value = "";
    },
    [upload]
  );

  const isDragging = state.status === "dragging";
  const isUploading = state.status === "uploading";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isUploading) setState({ status: "dragging" });
      }}
      onDragLeave={() => {
        if (!isUploading) setState({ status: "idle" });
      }}
      onDrop={isUploading ? undefined : onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-16 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
        isUploading && "pointer-events-none opacity-70"
      )}
    >
      {isUploading ? (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="font-medium">Extracting contract data…</p>
          <p className="text-sm text-muted-foreground mt-1">
            {state.filename}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            This usually takes 5–15 seconds.
          </p>
        </>
      ) : (
        <>
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full mb-4 transition-colors",
              isDragging ? "bg-primary/10" : "bg-muted"
            )}
          >
            {isDragging ? (
              <Upload className="h-6 w-6 text-primary" />
            ) : (
              <FileText className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <p className="font-medium mb-1">
            {isDragging ? "Drop to upload" : "Drag & drop a PDF here"}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            or click to browse — max 10 MB
          </p>

          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              Choose file
              <input
                type="file"
                accept=".pdf"
                className="sr-only"
                onChange={onFileChange}
                disabled={isUploading}
              />
            </label>
          </Button>

          {state.status === "error" && (
            <div className="mt-5 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
