"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, History, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { UseDocument } from "@/hooks/use-document";
import { validateHtml } from "@/lib/validate-html";
import { loadDoc } from "@/lib/storage";
import type { PersistedDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function UploadScreen({ doc }: { doc: UseDocument }) {
  const [dragging, setDragging] = useState(false);
  const [previous, setPrevious] = useState<PersistedDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Read persisted state after mount (localStorage is client-only; reading
    // here rather than in a useState initializer avoids a hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrevious(loadDoc());
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      const result = validateHtml(file.name, text);
      if (!result.ok) {
        toast.error(result.error ?? "Invalid file.");
        return;
      }
      await doc.loadHtml(file.name, text);
    },
    [doc]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile]
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-xl">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Live HTML</h1>
          <p className="text-muted-foreground text-sm">
            Upload an AI-generated HTML dashboard. We&apos;ll turn its data into an
            editable table so you can update it and watch the dashboard change live.
          </p>
        </div>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "border-muted-foreground/25 flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed py-14 text-center transition-colors",
            dragging && "border-primary bg-primary/5"
          )}
        >
          <FileUp className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">Drop your HTML file here</p>
            <p className="text-muted-foreground text-sm">or click to browse</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </Card>

        {previous && (
          <Card className="flex-row items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <History className="text-muted-foreground size-5 shrink-0" />
              <div className="overflow-hidden">
                <p className="truncate text-sm font-medium">{previous.fileName}</p>
                <p className="text-muted-foreground text-xs">
                  Saved {new Date(previous.savedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => doc.restorePrevious()}>
              Restore
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}
