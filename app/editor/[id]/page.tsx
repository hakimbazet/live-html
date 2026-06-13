"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileJson, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { hydrate } from "@/lib/loader";
import { downloadText, slugify } from "@/lib/download";
import type { DashboardData, Sheet } from "@/lib/schema";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Cell = string | number | boolean | null;

interface MergeProposal {
  type: "kpi" | "label";
  canonical: string;
  duplicates: string[];
  reason: string;
  value: string;
}

/** Preserve a cell's numeric-ness: if it started numeric and the new text is a
 *  finite number, keep it a number so the loader's formatter still applies. */
function coerce(original: Cell | undefined, input: string): Cell {
  if (typeof original === "number" && input.trim() !== "" && Number.isFinite(Number(input))) {
    return Number(input);
  }
  return input;
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [template, setTemplate] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedKpis, setEditedKpis] = useState<Set<string>>(new Set());
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<MergeProposal[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    fetch(`/api/dashboards/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Dashboard not found."))))
      .then((j) => {
        if (!alive) return;
        setTemplate(j.template);
        setData(j.data);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const debounced = useDebouncedValue(data, 350);
  const preview = useMemo(
    () => (debounced ? hydrate(template, debounced) : ""),
    [template, debounced]
  );

  const mutate = useCallback((fn: (d: DashboardData) => DashboardData) => {
    setData((prev) => (prev ? fn(structuredClone(prev)) : prev));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.issues?.join("; ") ?? json.error ?? "Save failed.");
      setDirty(false);
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [data, id]);

  const runOptimize = useCallback(async () => {
    if (!data) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/dashboards/${id}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Optimization failed.");
      const groups = (json.groups ?? []) as MergeProposal[];
      if (groups.length === 0) {
        toast.success("No duplicate values found — JSON already looks tidy.");
        return;
      }
      setProposal(groups);
      setSelected(new Set(groups.map((_, i) => i)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Optimization failed.");
    } finally {
      setOptimizing(false);
    }
  }, [data, id]);

  const applyOptimize = useCallback(async () => {
    if (!data || !proposal) return;
    const groups = proposal.filter((_, i) => selected.has(i));
    if (groups.length === 0) {
      setProposal(null);
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/dashboards/${id}/optimize`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, groups }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.issues?.join("; ") ?? json.message ?? "Apply failed.");
      setTemplate(json.template);
      setData(json.data);
      setDirty(false);
      setProposal(null);
      toast.success(`Merged ${json.removed} duplicate value${json.removed === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }, [data, id, proposal, selected]);

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
  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </main>
    );
  }

  const chartKeys = Object.keys(data.charts);
  const tableKeys = Object.keys(data.tables);
  const base = slugify(data.meta.title || data.meta.sourceFile || "dashboard");
  const downloadHtml = () =>
    downloadText(`${base}.html`, hydrate(template, data), "text/html");
  const downloadJson = () =>
    downloadText(`${base}.json`, JSON.stringify(data, null, 2), "application/json");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/verify/${id}`}>
              <ArrowLeft className="size-4" /> Verify
            </Link>
          </Button>
          <h1 className="text-sm font-semibold">{data.meta.title || "Untitled dashboard"}</h1>
          {dirty && <Badge variant="secondary">unsaved</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={optimizing}
            onClick={runOptimize}
            title="Use the LLM to find duplicate values to merge, then review before applying"
          >
            {optimizing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Optimize
          </Button>
          <Button variant="outline" size="sm" onClick={downloadHtml} title="Download the generated standalone HTML">
            <Download className="size-4" /> HTML
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} title="Download data.json">
            <FileJson className="size-4" /> JSON
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Editor */}
        <div className="min-h-0 overflow-auto border-b p-4 lg:border-b-0 lg:border-r">
          <Tabs defaultValue="kpis" className="w-full">
            <TabsList className="flex h-auto flex-wrap">
              <TabsTrigger value="kpis">KPIs</TabsTrigger>
              {chartKeys.map((k) => (
                <TabsTrigger key={`ct-${k}`} value={`chart:${k}`}>
                  {data.charts[k].label || k}
                </TabsTrigger>
              ))}
              {tableKeys.map((k) => (
                <TabsTrigger key={`tt-${k}`} value={`table:${k}`}>
                  {data.tables[k].label || k}
                </TabsTrigger>
              ))}
              <TabsTrigger value="narrative">Narrative</TabsTrigger>
              <TabsTrigger value="labels">Labels</TabsTrigger>
            </TabsList>

            {/* KPIs */}
            <TabsContent value="kpis" className="space-y-3 pt-4">
              {data.kpis.length === 0 && <Empty>No KPIs.</Empty>}
              {data.kpis.map((kpi, i) => (
                <div key={kpi.key} className="grid grid-cols-[1fr_1.4fr] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{kpi.label || kpi.key}</p>
                    <p className="text-muted-foreground font-mono text-xs">{kpi.format}</p>
                  </div>
                  <Input
                    value={String(kpi.value)}
                    onChange={(e) => {
                      const v = e.target.value;
                      mutate((d) => {
                        d.kpis[i].value = coerce(kpi.value, v) as string | number;
                        return d;
                      });
                      setEditedKpis((s) => new Set(s).add(kpi.key));
                    }}
                  />
                </div>
              ))}
            </TabsContent>

            {/* Charts */}
            {chartKeys.map((k) => (
              <TabsContent key={`cc-${k}`} value={`chart:${k}`} className="pt-4">
                <SheetEditor
                  sheet={data.charts[k]}
                  onChange={(fn) =>
                    mutate((d) => {
                      d.charts[k] = fn(d.charts[k]);
                      return d;
                    })
                  }
                />
              </TabsContent>
            ))}

            {/* Tables */}
            {tableKeys.map((k) => (
              <TabsContent key={`tc-${k}`} value={`table:${k}`} className="pt-4">
                <SheetEditor
                  sheet={data.tables[k]}
                  onChange={(fn) =>
                    mutate((d) => {
                      d.tables[k] = fn(d.tables[k]);
                      return d;
                    })
                  }
                />
              </TabsContent>
            ))}

            {/* Narrative */}
            <TabsContent value="narrative" className="space-y-4 pt-4">
              {data.narrative.length === 0 && <Empty>No narrative blocks.</Empty>}
              {data.narrative.map((n, i) => {
                const touched = n.mentions.filter((m) => editedKpis.has(m));
                return (
                  <div key={n.key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{n.label || n.key}</p>
                      {touched.length > 0 && (
                        <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                          mentions: {touched.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <Textarea
                      value={n.text}
                      rows={4}
                      onChange={(e) =>
                        mutate((d) => {
                          d.narrative[i].text = e.target.value;
                          return d;
                        })
                      }
                    />
                  </div>
                );
              })}
            </TabsContent>

            {/* Labels */}
            <TabsContent value="labels" className="space-y-3 pt-4">
              {data.labels.length === 0 && <Empty>No labels.</Empty>}
              {data.labels.map((l, i) => (
                <div key={l.key} className="grid grid-cols-[1fr_1.4fr] items-center gap-3">
                  <p className="truncate text-sm font-medium">{l.label || l.key}</p>
                  <Input
                    value={l.value}
                    onChange={(e) =>
                      mutate((d) => {
                        d.labels[i].value = e.target.value;
                        return d;
                      })
                    }
                  />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* Live preview */}
        <div className="flex min-h-0 flex-col">
          <div className="text-muted-foreground bg-muted/40 border-b px-3 py-1.5 text-xs font-medium">
            Live preview
          </div>
          <iframe
            title="Live preview"
            sandbox="allow-scripts"
            srcDoc={preview}
            className="min-h-0 flex-1 bg-white"
          />
        </div>
      </div>

      <Dialog open={proposal !== null} onOpenChange={(o) => !o && setProposal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review duplicate merges</DialogTitle>
            <DialogDescription>
              These keyed values look like the same fact under different keys. Applying
              keeps one entry and rewires every binding to it — so one edit updates all
              of them. Uncheck any you want to leave separate.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(proposal ?? []).map((g, i) => (
              <label
                key={i}
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={selected.has(i)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono">
                      {g.type}
                    </Badge>
                    <span className="font-mono text-xs">{g.canonical}</span>
                    {g.value && <span className="text-muted-foreground">= {g.value}</span>}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    merges{" "}
                    <span className="font-mono">{g.duplicates.join(", ")}</span>
                    {g.reason ? ` — ${g.reason}` : ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setProposal(null)} disabled={applying}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyOptimize} disabled={applying || selected.size === 0}>
              {applying ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Apply {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function SheetEditor({
  sheet,
  onChange,
}: {
  sheet: Sheet;
  onChange: (fn: (s: Sheet) => Sheet) => void;
}) {
  const addRow = () =>
    onChange((s) => ({ ...s, rows: [...s.rows, s.columns.map(() => "")] }));
  const removeRow = (idx: number) =>
    onChange((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== idx) }));
  const setCell = (r: number, c: number, value: string) =>
    onChange((s) => {
      const rows = s.rows.map((row) => [...row]);
      rows[r][c] = coerce(s.rows[r][c], value);
      return { ...s, rows };
    });

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {sheet.columns.map((col) => (
                <th
                  key={col}
                  className="text-muted-foreground border-b px-2 py-1.5 text-left text-xs font-medium"
                >
                  {col}
                </th>
              ))}
              <th className="w-8 border-b" />
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                {sheet.columns.map((_, c) => (
                  <td key={c} className="px-1 py-1">
                    <Input
                      className="h-8"
                      value={row[c] == null ? "" : String(row[c])}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => removeRow(r)}
                    aria-label="Remove row"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" /> Add row
      </Button>
    </div>
  );
}
