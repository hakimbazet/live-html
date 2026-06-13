/**
 * System prompt + reply parsing for the verify-screen chat assistant. The
 * assistant is scoped strictly to the two HTML documents under review (the
 * original dashboard and the migrated template). When asked to fix a visual
 * difference it returns a complete corrected template after a sentinel, which
 * the app applies deterministically (sanity-checked) on the user's confirm.
 */

export const FIX_SENTINEL = "===FIXED_TEMPLATE===";
export const DATA_SENTINEL = "===FIXED_DATA===";

const CHAT_SYSTEM_BASE = `You are a focused UI assistant embedded in the verification screen of an HTML
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

/** Cap context so a single chat turn stays within limits on large dashboards. */
const MAX_CONTEXT_CHARS = 60_000;

export function buildChatSystem(
  originalHtml: string,
  template: string,
  dataJson: string
): string {
  return (
    CHAT_SYSTEM_BASE +
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
  const idx = content.indexOf(FIX_SENTINEL);
  if (idx === -1) return { reply: content.trim() };
  const reply = content.slice(0, idx).trim();
  const rest = content.slice(idx + FIX_SENTINEL.length);

  const d = rest.indexOf(DATA_SENTINEL);
  const templateRaw = d === -1 ? rest : rest.slice(0, d);
  const dataRaw = d === -1 ? undefined : rest.slice(d + DATA_SENTINEL.length);

  const proposedTemplate = stripFences(templateRaw) || undefined;
  const proposedData = dataRaw !== undefined ? stripFences(dataRaw) || undefined : undefined;
  return {
    reply: reply || "Here's a proposed fix — review it before applying.",
    proposedTemplate,
    proposedData,
  };
}
