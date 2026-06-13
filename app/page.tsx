"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { validateHtml } from "@/lib/validate-html";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Phase = "idle" | "migrating";

type Event =
  | { type: "status"; message: string }
  | { type: "progress"; phase: string; chars: number }
  | { type: "done"; id: string; costUsd: number }
  | { type: "error"; message: string; issues?: string[] };

interface LogLine {
  message: string;
  done?: boolean;
}

export default function Home() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState<{ phase: string; chars: number } | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log, progress]);

  const migrate = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      const valid = validateHtml(file.name, text);
      if (!valid.ok) {
        toast.error(valid.error ?? "Invalid file.");
        return;
      }

      setPhase("migrating");
      setLog([]);
      setProgress(null);
      setIssues([]);
      setError(null);

      try {
        const res = await fetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: text, fileName: file.name }),
        });

        // Pre-stream failures (no API key, bad request) come back as JSON.
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => ({}));
          setError(json.message ?? "Migration failed.");
          setIssues(json.issues ?? []);
          setPhase("idle");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const handle = (e: Event) => {
          if (e.type === "status") {
            setProgress(null);
            setLog((l) => [...l, { message: e.message }]);
          } else if (e.type === "progress") {
            setProgress({ phase: e.phase, chars: e.chars });
          } else if (e.type === "done") {
            setProgress(null);
            setLog((l) => [...l, { message: "Done — opening verification.", done: true }]);
            toast.success(
              e.costUsd
                ? `Migrated (~$${e.costUsd.toFixed(4)}).`
                : "Migrated."
            );
            router.push(`/verify/${e.id}`);
          } else if (e.type === "error") {
            setError(e.message);
            setIssues(e.issues ?? []);
            setPhase("idle");
          }
        };

        // Read newline-delimited JSON events.
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) handle(JSON.parse(line) as Event);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Migration failed.");
        setPhase("idle");
      }
    },
    [router]
  );

  const busy = phase === "migrating";
  const showLog = busy || log.length > 0;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-xl">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">HTML Live Dashboards</h1>
          <p className="text-muted-foreground text-sm">
            Upload an AI-generated HTML dashboard. One migration call splits it into a
            design-only <code>template</code> and an editable <code>data.json</code>, with
            zero visual change — then verify and edit it live.
          </p>
        </div>

        <Card
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) migrate(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "border-muted-foreground/25 flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed py-14 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
            busy && "pointer-events-none opacity-70"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="text-primary size-8 animate-spin" />
              <div>
                <p className="font-medium">Migrating…</p>
                <p className="text-muted-foreground text-sm">
                  One LLM call — this can take up to a minute on large dashboards.
                </p>
              </div>
            </>
          ) : (
            <>
              <FileUp className="text-muted-foreground size-8" />
              <div>
                <p className="font-medium">Drop your HTML dashboard here</p>
                <p className="text-muted-foreground text-sm">or click to browse</p>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            disabled={busy}
            onChange={(e) => migrate(e.target.files?.[0])}
          />
        </Card>

        {showLog && (
          <Card className="bg-muted/30 p-0">
            <div className="text-muted-foreground border-b px-3 py-1.5 font-mono text-xs">
              migration log
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto px-3 py-2 font-mono text-xs">
              {log.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  {line.done ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <span className="text-muted-foreground shrink-0 select-none">›</span>
                  )}
                  <span className={cn(line.done && "text-emerald-700")}>{line.message}</span>
                </div>
              ))}
              {progress && (
                <div className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  <span>
                    {progress.phase === "repairing" ? "repairing" : "receiving output"} —{" "}
                    {progress.chars.toLocaleString()} chars
                  </span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </Card>
        )}

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 space-y-2 p-4">
            <div className="text-destructive flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" />
              {error}
            </div>
            {issues.length > 0 && (
              <ul className="text-muted-foreground list-disc space-y-1 pl-6 text-xs">
                {issues.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="secondary" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}
