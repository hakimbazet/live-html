import { parseData, type DashboardData } from "./schema";

export interface SanityResult {
  issues: string[];
  /** Present only when the data parsed and validated. */
  data?: DashboardData;
}

/** All data-bind="<type>:<key>" references in the template, grouped by type. */
function collectBindRefs(template: string): {
  kpi: Set<string>;
  label: Set<string>;
  narrative: Set<string>;
} {
  const out = {
    kpi: new Set<string>(),
    label: new Set<string>(),
    narrative: new Set<string>(),
  };
  const re = /data-bind\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    const [type, key] = m[1].split(":");
    if (type === "kpi") out.kpi.add(key);
    else if (type === "label") out.label.add(key);
    else if (type === "narrative") out.narrative.add(key);
  }
  return out;
}

function collectAttr(template: string, attr: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) out.add(m[1]);
  return out;
}

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x));
}

/** Approximate count of characters extracted out of the HTML into data.json. */
function extractedChars(data: DashboardData): number {
  let n = 0;
  for (const k of data.kpis) n += String(k.value).length;
  for (const l of data.labels) n += l.value.length;
  for (const nar of data.narrative) n += nar.text.length;
  for (const sheet of [...Object.values(data.charts), ...Object.values(data.tables)]) {
    for (const row of sheet.rows) for (const cell of row) n += String(cell ?? "").length;
  }
  return n;
}

/** Pull the <script type="application/json" id="chart-styles">…</script> body. */
function chartStylesBlock(template: string): string | null {
  const re =
    /<script[^>]*id=["']chart-styles["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(template);
  return m ? m[1].trim() : null;
}

/**
 * Deterministic, cheap post-migration checks. Returns a list of human-readable
 * issues; empty array means the migration is structurally sound. A non-length
 * finish_reason is the caller's responsibility (passed in for completeness).
 */
export function runSanityChecks(
  originalHtml: string,
  template: string,
  dataRaw: string,
  finishReason?: string
): SanityResult {
  const issues: string[] = [];

  // 5. Truncation (handled upstream, asserted here for completeness).
  if (finishReason === "length") {
    issues.push("Output truncated (finish_reason=length); template is incomplete.");
  }

  // 1. JSON parses + validates against the zod schema.
  const parsed = parseData(dataRaw);
  if (!parsed.ok) {
    issues.push(parsed.error);
    return { issues }; // nothing else is meaningful without valid data
  }
  const data = parsed.data;

  // 2. Bidirectional key integrity: every template ref has data, and vice versa.
  const refs = collectBindRefs(template);
  const chartRefs = collectAttr(template, "data-chart");
  const tableRefs = collectAttr(template, "data-table");

  const kpiKeys = new Set(data.kpis.map((k) => k.key));
  const labelKeys = new Set(data.labels.map((l) => l.key));
  const narrativeKeys = new Set(data.narrative.map((n) => n.key));
  const chartKeys = new Set(Object.keys(data.charts));
  const tableKeys = new Set(Object.keys(data.tables));

  const orphans = [
    ...diff(refs.kpi, kpiKeys).map((k) => `template binds kpi:${k} but data.kpis has no such key`),
    ...diff(refs.label, labelKeys).map((k) => `template binds label:${k} but data.labels has no such key`),
    ...diff(refs.narrative, narrativeKeys).map((k) => `template binds narrative:${k} but data.narrative has no such key`),
    ...diff(chartRefs, chartKeys).map((k) => `template references data-chart="${k}" but data.charts has no such key`),
    ...diff(tableRefs, tableKeys).map((k) => `template references data-table="${k}" but data.tables has no such key`),
    ...diff(kpiKeys, refs.kpi).map((k) => `data.kpis["${k}"] is never bound in the template`),
    ...diff(labelKeys, refs.label).map((k) => `data.labels["${k}"] is never bound in the template`),
    ...diff(narrativeKeys, refs.narrative).map((k) => `data.narrative["${k}"] is never bound in the template`),
    ...diff(chartKeys, chartRefs).map((k) => `data.charts["${k}"] has no data-chart="${k}" element`),
    ...diff(tableKeys, tableRefs).map((k) => `data.tables["${k}"] has no data-table="${k}" element`),
  ];
  issues.push(...orphans);

  // 3. Template byte-length sanity (catches accidental full rewrites).
  const originalLen = originalHtml.length;
  const templateLen = template.length;
  const expected = originalLen - extractedChars(data);
  const tol = 0.15 * originalLen;
  // Lower bound: template can't be far shorter than (original minus extracted
  // values). Upper bound: it only adds small marker attributes, so it should
  // not grow well past the original.
  if (templateLen < expected - tol || templateLen > originalLen + tol) {
    issues.push(
      `template length ${templateLen} is outside the expected band ` +
        `[${Math.round(expected - tol)}, ${Math.round(originalLen + tol)}] ` +
        `(original ${originalLen}, ~${expected} after extraction) — possible rewrite/drift.`
    );
  }

  // 4. chart-styles block parses and its keys are a subset of chart keys.
  if (chartKeys.size > 0 || /id=["']chart-styles["']/.test(template)) {
    const block = chartStylesBlock(template);
    if (block === null) {
      if (chartKeys.size > 0)
        issues.push("data has charts but template has no #chart-styles block.");
    } else {
      try {
        const styles = JSON.parse(block) as Record<string, unknown>;
        for (const key of Object.keys(styles)) {
          if (!chartKeys.has(key))
            issues.push(`#chart-styles key "${key}" has no matching chart in data.charts.`);
        }
      } catch (e) {
        issues.push(`#chart-styles is not valid JSON: ${(e as Error).message}`);
      }
    }
  }

  return { issues, data };
}
