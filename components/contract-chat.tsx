"use client";

import { useState, useRef, FormEvent } from "react";
import { Send, Loader2, Quote, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Chunk = {
  id: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  chunks?: Chunk[];
  error?: string;
};

export function ContractChat({ contractId }: { contractId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    const userMsg: Message = { role: "user", content: question };
    const assistantIndex = messages.length + 1;
    setMessages((m) => [
      ...m,
      userMsg,
      { role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, question }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((m) => {
          const next = [...m];
          next[assistantIndex] = {
            role: "assistant",
            content: "",
            error: err.details ?? err.error ?? "Request failed",
          };
          return next;
        });
        return;
      }

      let chunks: Chunk[] | undefined;
      const header = res.headers.get("X-Retrieved-Chunks");
      if (header) {
        try {
          chunks = JSON.parse(decodeURIComponent(header));
        } catch {
          chunks = undefined;
        }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[assistantIndex] = {
            role: "assistant",
            content: accumulated,
            chunks,
          };
          return next;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages((m) => {
        const next = [...m];
        next[assistantIndex] = {
          role: "assistant",
          content: "",
          error: msg,
        };
        return next;
      });
    } finally {
      setIsStreaming(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }

  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MessageSquare className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Chat with this contract</h3>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-[200px] max-h-[480px] overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            Ask anything about this contract — e.g.{" "}
            <span className="italic">
              &ldquo;What&apos;s the termination notice period?&rdquo;
            </span>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              isStreaming={
                isStreaming &&
                i === messages.length - 1 &&
                msg.role === "assistant"
              }
              openCitation={openCitation}
              onToggleCitation={setOpenCitation}
              messageIndex={i}
            />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          disabled={isStreaming}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
  openCitation,
  onToggleCitation,
  messageIndex,
}: {
  message: Message;
  isStreaming: boolean;
  openCitation: string | null;
  onToggleCitation: (key: string | null) => void;
  messageIndex: number;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="text-sm text-destructive">Error: {message.error}</div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-w-[90%]">
      <div className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
        {message.content || (
          <span className="text-muted-foreground italic">Thinking…</span>
        )}
        {isStreaming && message.content && (
          <span className="inline-block ml-0.5 h-3 w-1.5 bg-foreground/60 animate-pulse align-middle" />
        )}
      </div>

      {message.chunks && message.chunks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.chunks.map((c, i) => {
            const key = `${messageIndex}-${i}`;
            const isOpen = openCitation === key;
            return (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => onToggleCitation(isOpen ? null : key)}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs hover:bg-accent"
                >
                  <Quote className="h-3 w-3" />
                  chunk {i + 1}
                  <span className="text-muted-foreground">
                    · {(c.similarity * 100).toFixed(0)}%
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 rounded-md border bg-muted/50 px-3 py-2 text-xs whitespace-pre-wrap max-w-prose">
                    {c.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
