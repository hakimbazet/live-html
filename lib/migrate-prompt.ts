export const TEMPLATE_SENTINEL = "===TEMPLATE===";
export const DATA_SENTINEL = "===DATA===";

export const MIGRATE_SYSTEM = `You are an HTML dashboard migration engine. You receive a complete HTML
dashboard. Produce TWO outputs separated by sentinels.

1. TEMPLATE — the same HTML, modified ONLY as follows:
   - Every dynamic data value (KPI numbers, prices, percentages, dates,
     ratings, chart data, table rows, narrative paragraphs) is replaced
     with a marker per the conventions below. The element's tag, classes,
     attributes, and position must be unchanged. Remove only the hardcoded
     value/content being bound.
   - Scalars:    <span data-bind="kpi:target_price"></span>
   - Narrative:  <p data-bind="narrative:investment_thesis"></p>
   - Labels:     <div data-bind="label:as_of_date"></div>
   - Charts: keep the <canvas>/container exactly in place; add
     data-chart="<key>" and data-chart-type="bar|line|doughnut|...".
     Move the chart's DATA into the JSON. Keep its STYLING (colors, fonts,
     gridlines, dataset options) in a single
     <script type="application/json" id="chart-styles"> block keyed by
     chart key, with shape { "<key>": { "datasets": [...], "options": {...} } }.
     Delete the original inline chart-construction script.
   - Tables: keep <thead> verbatim; empty <tbody> and add data-table-body
     attribute; add data-table="<key>" on the <table>.
   - Do NOT restructure, reformat, re-indent, rename classes, or clean up
     anything. Every byte you don't have to touch must remain identical.
   - When unsure whether something is data or design (e.g. a section
     heading), treat it as design and leave it untouched.

2. DATA — a JSON document following the provided schema, containing every
   value you removed:
   - Deduplicate: same value, same meaning -> ONE entry, bind all
     locations to it. Same display string, different meaning -> separate keys.
   - Keys are snake_case, semantic, stable (target_price, not value_1).
   - Narrative paragraphs go to narrative[] whole. Do not extract numbers
     out of sentences. Populate mentions[] with kpi keys whose values
     appear inside the text.

The JSON schema is:
{
  "version": 1,
  "meta": { "title": string, "sourceFile": string },
  "kpis":   [{ "key": string, "label": string, "value": number|string, "format": "currency:MYR:2"|"percent:1"|"number:0"|"text" }],
  "charts": { "<key>": { "label": string, "columns": [string, ...], "rows": [[cell, ...], ...] } },
  "tables": { "<key>": { "label": string, "columns": [string, ...], "rows": [[cell, ...], ...] } },
  "narrative": [{ "key": string, "label": string, "text": string, "mentions": [string, ...] }],
  "labels": [{ "key": string, "value": string }]
}
For charts/tables, columns[0] is the x-axis / first column and remaining
columns are the series / remaining columns. Store KPI raw numbers when the
format can reproduce the display; otherwise store the display string with
format "text".

Output EXACTLY this structure, nothing before or after:
${TEMPLATE_SENTINEL}
<full html>
${DATA_SENTINEL}
<full json, no markdown fences>`;

function stripFences(s: string): string {
  let out = s.trim();
  // Strip a leading ```lang fence and trailing ``` if the model added them.
  out = out.replace(/^```[a-zA-Z]*\s*\n?/, "");
  out = out.replace(/\n?```\s*$/, "");
  return out.trim();
}

/**
 * Deterministically split the model output into template + data by sentinel.
 * Throws if the structure is missing — never guess a boundary.
 */
export function parseSentinels(content: string): { template: string; data: string } {
  const t = content.indexOf(TEMPLATE_SENTINEL);
  const d = content.indexOf(DATA_SENTINEL);
  if (t === -1 || d === -1 || d < t) {
    throw new Error(
      `Output missing sentinels (${TEMPLATE_SENTINEL} / ${DATA_SENTINEL}).`
    );
  }
  const template = stripFences(content.slice(t + TEMPLATE_SENTINEL.length, d));
  const data = stripFences(content.slice(d + DATA_SENTINEL.length));
  return { template, data };
}

/** Build the repair message appended to a second attempt when checks fail. */
export function repairMessage(issues: string[]): string {
  return [
    "Your previous output failed these deterministic checks:",
    ...issues.map((i) => `- ${i}`),
    "",
    "Re-emit the FULL corrected output in the exact same",
    `${TEMPLATE_SENTINEL} / ${DATA_SENTINEL} structure. Fix only what the`,
    "checks flag; do not otherwise change the template or invent new keys.",
  ].join("\n");
}
