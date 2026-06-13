import { z } from "zod";
import { runSanityChecks } from "./sanity";
import type { DashboardData } from "./schema";

/**
 * Optional second LLM pass over a migrated data.json: find keyed scalar entries
 * (kpis / labels) that are genuinely the SAME value AND meaning, and collapse
 * them to one canonical key. The LLM only *proposes* groupings; merging is
 * applied deterministically below and re-validated by the sanity checks, so a
 * bad suggestion can never silently corrupt a dashboard.
 *
 * Scope is deliberately limited to kpis and labels — the only bindings keyed
 * 1:1 by `data-bind`, so rewiring the template is an exact attribute rewrite.
 * Chart/table cells render whole rows from a sheet and have no per-value key.
 */

export const MergeGroupSchema = z.object({
  type: z.enum(["kpi", "label"]),
  /** The key to keep. */
  canonical: z.string().min(1),
  /** Keys to remove; every `data-bind` to them is rewired to `canonical`. */
  duplicates: z.array(z.string().min(1)).min(1),
  /** Short rationale shown in the review dialog. */
  reason: z.string().default(""),
});

export const ProposalSchema = z.object({
  groups: z.array(MergeGroupSchema).default([]),
});

export type MergeGroup = z.infer<typeof MergeGroupSchema>;

export const OPTIMIZE_SYSTEM = `You optimize a migrated dashboard's data model. You receive the KPI and label
entries extracted from one dashboard (key, label, value, format). Your job is to
find entries that are duplicates of each other: the SAME underlying value AND the
SAME meaning, just stored under different keys.

Rules:
- Only group entries that are truly the same fact. Identical display strings with
  DIFFERENT meaning (e.g. two unrelated "12.4%" figures) MUST stay separate.
- Only group within the same type (kpi with kpi, label with label).
- For each duplicate set, pick the most semantic, stable key as the canonical one
  and list the others as duplicates.
- Be conservative. When unsure, do not group. Returning zero groups is correct if
  there are no real duplicates.

Respond with JSON only, no prose, of the form:
{ "groups": [ { "type": "kpi"|"label", "canonical": "<key>", "duplicates": ["<key>", ...], "reason": "<short why>" } ] }`;

export function buildOptimizeUser(data: DashboardData): string {
  const kpis = data.kpis.map((k) => ({ key: k.key, label: k.label, value: k.value, format: k.format }));
  const labels = data.labels.map((l) => ({ key: l.key, label: l.label ?? "", value: l.value }));
  return (
    "Find duplicate entries to merge. Return JSON as specified.\n\n" +
    "kpis:\n" +
    JSON.stringify(kpis, null, 2) +
    "\n\nlabels:\n" +
    JSON.stringify(labels, null, 2)
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewire every `data-bind="<type>:<from>"` in the template to `<type>:<to>`. */
function rewire(template: string, type: string, from: string, to: string): string {
  const re = new RegExp(`(data-bind\\s*=\\s*["'])${escapeRe(type)}:${escapeRe(from)}(["'])`, "g");
  return template.replace(re, `$1${type}:${to}$2`);
}

export interface ApplyResult {
  ok: boolean;
  template: string;
  data: DashboardData;
  issues: string[];
  /** Number of duplicate entries removed (for UI feedback). */
  removed: number;
}

/**
 * Apply merge groups deterministically: rewrite the template's bind keys, drop
 * the duplicate data entries, then run the full sanity suite. Returns ok=false
 * with issues if the groups are malformed or the result fails checks — in which
 * case the caller must NOT persist.
 */
export function applyMerges(
  originalHtml: string,
  template: string,
  data: DashboardData,
  groups: MergeGroup[]
): ApplyResult {
  const next: DashboardData = structuredClone(data);
  const issues: string[] = [];

  const kpiKeys = new Set(next.kpis.map((k) => k.key));
  const labelKeys = new Set(next.labels.map((l) => l.key));
  const seen = new Set<string>(); // every key touched, to forbid reuse across groups

  // ---- Validate the proposal up front; reject the whole apply if malformed. ----
  for (const g of groups) {
    const keys = g.type === "kpi" ? kpiKeys : labelKeys;
    const tag = (k: string) => `${g.type}:${k}`;
    if (!keys.has(g.canonical)) issues.push(`canonical ${tag(g.canonical)} does not exist`);
    if (seen.has(tag(g.canonical))) issues.push(`${tag(g.canonical)} used in more than one group`);
    seen.add(tag(g.canonical));
    for (const d of g.duplicates) {
      if (d === g.canonical) issues.push(`${tag(d)} is listed as both canonical and duplicate`);
      if (!keys.has(d)) issues.push(`duplicate ${tag(d)} does not exist`);
      if (seen.has(tag(d))) issues.push(`${tag(d)} used in more than one group`);
      seen.add(tag(d));
    }
  }
  if (issues.length) {
    return { ok: false, template, data, issues, removed: 0 };
  }

  // ---- Apply: rewire template + drop duplicate entries. ----
  let newTemplate = template;
  let removed = 0;
  const dropKpi = new Set<string>();
  const dropLabel = new Set<string>();
  for (const g of groups) {
    for (const d of g.duplicates) {
      newTemplate = rewire(newTemplate, g.type, d, g.canonical);
      if (g.type === "kpi") dropKpi.add(d);
      else dropLabel.add(d);
      removed++;
    }
  }
  next.kpis = next.kpis.filter((k) => !dropKpi.has(k.key));
  next.labels = next.labels.filter((l) => !dropLabel.has(l.key));

  // ---- Re-validate the rewired result. ----
  const check = runSanityChecks(originalHtml, newTemplate, JSON.stringify(next));
  return {
    ok: check.issues.length === 0,
    template: newTemplate,
    data: check.data ?? next,
    issues: check.issues,
    removed,
  };
}
