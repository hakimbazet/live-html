"use client";

import { useMemo } from "react";
import { AlertTriangle, KeyRound, RefreshCw } from "lucide-react";
import type { Field, FieldKind } from "@/lib/types";
import type { UseDocument } from "@/hooks/use-document";
import { FieldGroupSection } from "./field-group-section";
import { Accordion } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type TabKey = "all" | "content" | "media" | "chart";

const TAB_KINDS: Record<TabKey, FieldKind[] | null> = {
  all: null,
  content: ["text"],
  media: ["attr"],
  chart: ["script-string", "script-number"],
};

function matches(field: Field, query: string, value: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    field.label.toLowerCase().includes(q) ||
    field.breadcrumb.toLowerCase().includes(q) ||
    value.toLowerCase().includes(q)
  );
}

export function FieldPanel({
  doc,
  search,
}: {
  doc: UseDocument;
  search: string;
}) {
  const counts = useMemo(() => {
    let content = 0,
      media = 0,
      chart = 0;
    for (const f of doc.allFields) {
      if (f.kind === "text") content++;
      else if (f.kind === "attr") media++;
      else chart++;
    }
    return { content, media, chart, all: doc.allFields.length };
  }, [doc.allFields]);

  return (
    <Tabs defaultValue="all" className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b px-4 py-2">
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="content">Content ({counts.content})</TabsTrigger>
          <TabsTrigger value="media">Media ({counts.media})</TabsTrigger>
          <TabsTrigger value="chart">Chart Data ({counts.chart})</TabsTrigger>
        </TabsList>
      </div>

      <div className="min-h-0 flex-1">
        {(["all", "content", "media", "chart"] as TabKey[]).map((tab) => (
          <TabsContent key={tab} value={tab} className="h-full data-[state=inactive]:hidden">
            <ScrollArea className="h-full">
              <div className="px-3 py-2">
                {tab === "chart" ? (
                  <ChartTab doc={doc} search={search} />
                ) : (
                  <GroupedFields doc={doc} search={search} kinds={TAB_KINDS[tab]} />
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

function GroupedFields({
  doc,
  search,
  kinds,
}: {
  doc: UseDocument;
  search: string;
  kinds: FieldKind[] | null;
}) {
  const { groups, fieldsByGroup, openIds } = useMemo(() => {
    const allow = kinds ? new Set(kinds) : null;
    const byGroup = new Map<string, Field[]>();
    for (const f of doc.allFields) {
      if (allow && !allow.has(f.kind)) continue;
      const value = doc.state.edits[f.id] ?? f.original;
      if (!matches(f, search, value)) continue;
      const arr = byGroup.get(f.groupId) ?? [];
      arr.push(f);
      byGroup.set(f.groupId, arr);
    }
    const groups = doc.allGroups.filter((g) => byGroup.has(g.id));
    return {
      groups,
      fieldsByGroup: byGroup,
      openIds: groups.map((g) => g.id),
    };
  }, [doc.allFields, doc.allGroups, doc.state.edits, search, kinds]);

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {search ? "No fields match your search." : "No editable fields here."}
      </p>
    );
  }

  return (
    <Accordion type="multiple" defaultValue={openIds} className="w-full">
      {groups.map((g) => (
        <FieldGroupSection
          key={g.id}
          group={g}
          fields={fieldsByGroup.get(g.id) ?? []}
          doc={doc}
        />
      ))}
    </Accordion>
  );
}

function ChartTab({ doc, search }: { doc: UseDocument; search: string }) {
  const status = doc.state.scriptStatus;

  if (doc.state.scripts.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        This dashboard has no inline scripts to extract chart data from.
      </p>
    );
  }

  if (status === "loading") {
    return (
      <div className="space-y-3 py-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
        <p className="text-muted-foreground text-center text-xs">
          Reading chart data from the script…
        </p>
      </div>
    );
  }

  if (status === "no-key") {
    return (
      <Alert className="mt-2">
        <KeyRound className="size-4" />
        <AlertTitle>Chart data extraction unavailable</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> in
          <code className="font-mono"> .env.local</code> to edit values inside
          chart scripts. All other content is editable without it.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "error") {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertTriangle className="size-4" />
        <AlertTitle>Couldn&apos;t extract chart data</AlertTitle>
        <AlertDescription>
          {doc.state.scriptError ?? "Something went wrong."}
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={doc.reExtractScripts}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // done
  if (doc.state.scriptFields.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-muted-foreground text-sm">
          No editable chart data values were found.
        </p>
        <Button size="sm" variant="outline" onClick={doc.reExtractScripts}>
          <RefreshCw className="size-3.5" />
          Re-extract chart data
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={doc.reExtractScripts}>
          <RefreshCw className="size-3.5" />
          Re-extract
        </Button>
      </div>
      <GroupedFields doc={doc} search={search} kinds={TAB_KINDS.chart} />
    </div>
  );
}
