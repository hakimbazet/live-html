"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { validateHtml } from "@/lib/validate-html";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Phase = "idle" | "migrating";

export default function Home() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setIssues([]);
      setError(null);
      try {
        const res = await fetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: text, fileName: file.name }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.message ?? "Migration failed.");
          setIssues(json.issues ?? []);
          setPhase("idle");
          return;
        }
        toast.success(
          json.costUsd
            ? `Migrated (~$${json.costUsd.toFixed(4)}). Review the result.`
            : "Migrated. Review the result."
        );
        router.push(`/verify/${json.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Migration failed.");
        setPhase("idle");
      }
    },
    [router]
  );

  const busy = phase === "migrating";

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
