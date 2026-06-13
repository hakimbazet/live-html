"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Loader2, PencilLine, Plus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface DashboardMeta {
  id: string;
  title: string;
  sourceFile: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  updatedAt: number;
  costUsd?: number;
}

const statusVariant: Record<DashboardMeta["status"], "default" | "secondary" | "outline"> = {
  approved: "default",
  pending: "secondary",
  rejected: "outline",
};

export default function GalleryPage() {
  const [items, setItems] = useState<DashboardMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboards")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load gallery."))))
      .then((j) => alive && setItems(j.dashboards))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" /> New
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <LayoutGrid className="text-muted-foreground size-4" />
            <h1 className="text-sm font-semibold">Gallery</h1>
            {items && (
              <span className="text-muted-foreground text-xs">
                {items.length} dashboard{items.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/">
            <Plus className="size-4" /> Migrate new
          </Link>
        </Button>
      </header>

      {error && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      )}

      {!error && !items && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <LayoutGrid className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">
            Nothing saved yet. Migrate a dashboard to see it here.
          </p>
          <Button asChild size="sm">
            <Link href="/">
              <Plus className="size-4" /> Migrate a dashboard
            </Link>
          </Button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <Card key={m.id} className="gap-0 overflow-hidden p-0">
              <Link href={`/editor/${m.id}`} className="block">
                <Thumb id={m.id} />
              </Link>
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={m.title}>
                      {m.title || "Untitled"}
                    </p>
                    <p className="text-muted-foreground truncate text-xs" title={m.sourceFile}>
                      {m.sourceFile}
                    </p>
                  </div>
                  <Badge variant={statusVariant[m.status]} className="shrink-0 capitalize">
                    {m.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                  {m.costUsd != null && <span>~${m.costUsd.toFixed(4)}</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/verify/${m.id}`}>
                      <Eye className="size-3.5" /> Verify
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/editor/${m.id}`}>
                      <PencilLine className="size-3.5" /> Edit
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

/** Lazy, non-interactive live preview of a saved dashboard, scaled down. */
function Thumb({ id }: { id: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboards/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && setHtml(j.hydrated))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="bg-muted relative h-44 w-full overflow-hidden border-b">
      {html ? (
        <iframe
          title="Dashboard preview"
          sandbox="allow-scripts"
          srcDoc={html}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 origin-top-left bg-white"
          style={{ width: "250%", height: "250%", transform: "scale(0.4)" }}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
