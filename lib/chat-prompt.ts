/**
 * System prompts + reply parsing for the dashboard chat assistant. Two focuses:
 *  - "ui"   (verify screen): scoped to the two HTML documents; fixes the
 *           template (and data.json when a fix requires it).
 *  - "data" (editor):        scoped to data.json; edits values/labels/formats/
 *           rows/narrative, keeping keys in sync with the template's markers.
 *
 * In both cases the model only *proposes*; changes are applied deterministically
 * and re-run through the sanity suite before persisting.
 */

export const FIX_SENTINEL = "===FIXED_TEMPLATE===";
export const DATA_SENTINEL = "===FIXED_DATA===";

export type ChatFocus = "ui" | "data";

const UI_SYSTEM = `You are a focused UI assistant embedded in the verification screen of an HTML
dashboard migration tool. You are given THREE inputs:

1) ORIGINAL — the source dashboard; the intended look.
2) GENERATED TEMPLATE — the migrated version. It renders by replacing
   data-bind / data-chart / data-table markers with values at runtime, plus a
   <script type="application/json" id="chart-styles"> block. These markers and
   that block MUST be preserved.
3) CURRENT DATA (data.json) — the values that fill those markers.

The user may attach SCREENSHOTS of the rendered generated dashboard to point out
visual differences from the original.

STRICT SCOPE — this is your only job:
- Only discuss and fix visual/structural differences between THESE documents.
- If the user asks anything unrelated to them (general knowledge, other code,
  other topics), politely decline in ONE sentence and steer them back. Do not
  answer it.

When the user wants you to FIX a difference:
- Briefly explain the change (1–3 sentences).
- Then output the COMPLETE corrected GENERATED TEMPLATE, beginning with a line
  containing exactly:
${FIX_SENTINEL}
  In it: preserve every data-bind / data-chart / data-table marker and the
  #chart-styles block; never inline data values; change only what the fix needs
  (CSS/markup). Do not reformat unrelated parts.
- IF AND ONLY IF the fix also requires changing the data model — e.g. you add or
  remove a marker, or a label / value / format must change — ALSO output the
  COMPLETE corrected data.json after a line containing exactly:
${DATA_SENTINEL}
  following the same schema as CURRENT DATA, with keys kept in sync with the
  template's markers (every marker has a data entry and vice versa). If the data
  does not need to change, OMIT this section and the current data is kept.
- Output nothing after the last section.

If you are only answering or clarifying (no change needed), do NOT include either
sentinel.`;

const DATA_SYSTEM = `You are a focused DATA assistant embedded in the editor of an HTML dashboard
tool. You are given:

1) CURRENT DATA (data.json) — the editable values: kpis, charts, tables,
   narrative, labels. THIS is what you edit.
2) GENERATED TEMPLATE — for reference only. It binds to the data via
   data-bind / data-chart / data-table markers. You must NOT change the template.

STRICT SCOPE — this is your only job:
- Only discuss and edit this dashboard's DATA (values, labels, display formats,
  chart/table rows and columns, narrative text, and which entries exist).
- Do NOT change the template's design/markup or layout.
- If the user asks anything unrelated to this dashboard's data (general
  knowledge, visual styling, other topics), politely decline in ONE sentence and
  steer them back. Do not answer it.

You can: correct values; fix display formats (currency:MYR:2, percent:1,
number:0, text); relabel; edit / reorder / add / remove chart and table rows;
tidy narrative text; remove genuinely duplicate entries. Keep keys in sync with
the template's markers: do NOT introduce a key that has no marker, and do NOT
remove a key the template still binds.

When the user wants you to change the data:
- Briefly explain the change (1–3 sentences).
- Then output the COMPLETE corrected data.json after a line containing exactly:
${DATA_SENTINEL}
  following the same schema as CURRENT DATA. Output nothing after it.

If you are only answering or clarifying (no change needed), do NOT include the
sentinel.`;

/** Cap context so a single chat turn stays within limits on large dashboards. */
const MAX_CONTEXT_CHARS = 60_000;

export function buildChatSystem(
  focus: ChatFocus,
  originalHtml: string,
  template: string,
  dataJson: string
): string {
  if (focus === "data") {
    return (
      DATA_SYSTEM +
      "\n\n=== CURRENT DATA (data.json) ===\n" +
      dataJson.slice(0, MAX_CONTEXT_CHARS) +
      "\n\n=== GENERATED TEMPLATE (reference only) ===\n" +
      template.slice(0, MAX_CONTEXT_CHARS)
    );
  }
  return (
    UI_SYSTEM +
    "\n\n=== ORIGINAL ===\n" +
    originalHtml.slice(0, MAX_CONTEXT_CHARS) +
    "\n\n=== GENERATED TEMPLATE ===\n" +
    template.slice(0, MAX_CONTEXT_CHARS) +
    "\n\n=== CURRENT DATA (data.json) ===\n" +
    dataJson.slice(0, MAX_CONTEXT_CHARS)
  );
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/** Split a reply into prose + an optional proposed template + optional data. */
export function parseChatReply(content: string): {
  reply: string;
  proposedTemplate?: string;
  proposedData?: string;
} {
  const tIdx = content.indexOf(FIX_SENTINEL);
  const dIdx = content.indexOf(DATA_SENTINEL);
  if (tIdx === -1 && dIdx === -1) return { reply: content.trim() };

  const firstIdx = Math.min(...[tIdx, dIdx].filter((i) => i !== -1));
  const reply = content.slice(0, firstIdx).trim();

  let proposedTemplate: string | undefined;
  if (tIdx !== -1) {
    const end = dIdx !== -1 && dIdx > tIdx ? dIdx : content.length;
    proposedTemplate = stripFences(content.slice(tIdx + FIX_SENTINEL.length, end)) || undefined;
  }
  let proposedData: string | undefined;
  if (dIdx !== -1) {
    proposedData = stripFences(content.slice(dIdx + DATA_SENTINEL.length)) || undefined;
  }
  return {
    reply: reply || "Here's a proposed change — review it before applying.",
    proposedTemplate,
    proposedData,
  };
}
