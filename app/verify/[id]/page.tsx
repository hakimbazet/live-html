"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X, Loader2, ArrowLeft, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DashboardResponse {
  meta: { id: string; title: string; sourceFile: string; status: string; costUsd?: number };
  originalHtml: string;
  template: string;
  hydrated: string;
}

export default function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboards/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Dashboard not found."))))
      .then((j) => alive && setRecord(j))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const decide = async (status: "approved" | "rejected") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Could not update status.");
      if (status === "approved") {
        toast.success("Approved — migration frozen.");
        router.push(`/editor/${id}`);
      } else {
        toast("Rejected.");
        setRecord((r) => (r ? { ...r, meta: { ...r.meta, status } } : r));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button asChild variant="secondary" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>
      </main>
    );
  }

  if (!record) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" /> New
            </Link>
          </Button>
          <div>
            <h1 className="text-sm font-semibold">{record.meta.title}</h1>
            <p className="text-muted-foreground text-xs">{record.meta.sourceFile}</p>
          </div>
          <Badge variant={record.meta.status === "approved" ? "default" : "secondary"}>
            {record.meta.status}
          </Badge>
          {record.meta.costUsd != null && (
            <span className="text-muted-foreground text-xs">
              ~${record.meta.costUsd.toFixed(4)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => decide("rejected")}>
            <X className="size-4" /> Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={() => decide("approved")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/editor/${id}`}>
              <PencilLine className="size-4" /> Editor
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <figure className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
          <figcaption className="text-muted-foreground bg-muted/40 border-b px-3 py-1.5 text-xs font-medium">
            Original
          </figcaption>
          <iframe
            title="Original dashboard"
            sandbox="allow-scripts"
            srcDoc={record.originalHtml}
            className="min-h-0 flex-1 bg-white"
          />
        </figure>
        <figure className="flex min-h-0 flex-col">
          <figcaption className="text-muted-foreground bg-muted/40 border-b px-3 py-1.5 text-xs font-medium">
            Migrated (template + data + loader)
          </figcaption>
          <iframe
            title="Migrated dashboard"
            sandbox="allow-scripts"
            srcDoc={record.hydrated}
            className="min-h-0 flex-1 bg-white"
          />
        </figure>
      </div>
    </main>
  );
}
