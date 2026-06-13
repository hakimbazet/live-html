/**
 * System prompt + reply parsing for the verify-screen chat assistant. The
 * assistant is scoped strictly to the two HTML documents under review (the
 * original dashboard and the migrated template). When asked to fix a visual
 * difference it returns a complete corrected template after a sentinel, which
 * the app applies deterministically (sanity-checked) on the user's confirm.
 */

export const FIX_SENTINEL = "===FIXED_TEMPLATE===";

const CHAT_SYSTEM_BASE = `You are a focused UI assistant embedded in the verification screen of an HTML
dashboard migration tool. You are given exactly TWO HTML documents:

1) ORIGINAL — the source dashboard; the intended look.
2) GENERATED TEMPLATE — the migrated version. It renders by replacing
   data-bind / data-chart / data-table markers with values at runtime, plus a
   <script type="application/json" id="chart-styles"> block. These markers and
   that block MUST be preserved exactly.

The user may attach SCREENSHOTS of the rendered generated dashboard to point out
visual differences from the original.

STRICT SCOPE — this is your only job:
- Only discuss and fix visual/structural differences between THESE TWO documents.
- If the user asks anything unrelated to these two documents (general knowledge,
  other code, other topics, requests to change data values rather than design),
  politely decline in ONE sentence and steer them back. Do not answer it.

When the user wants you to FIX a difference:
- Briefly explain the change (1–3 sentences).
- Then output the COMPLETE corrected GENERATED TEMPLATE, and nothing after it,
  beginning with a line containing exactly:
${FIX_SENTINEL}
- In the corrected template: preserve every data-bind / data-chart / data-table
  marker and the #chart-styles block; never inline data values; change only what
  is needed for the discussed visual fix (CSS/markup). Do not reformat unrelated
  parts.

If you are only answering or clarifying (no change needed), do NOT include the
sentinel and do NOT output a template.`;

/** Cap context so a single chat turn stays within limits on large dashboards. */
const MAX_CONTEXT_CHARS = 60_000;

export function buildChatSystem(originalHtml: string, template: string): string {
  return (
    CHAT_SYSTEM_BASE +
    "\n\n=== ORIGINAL ===\n" +
    originalHtml.slice(0, MAX_CONTEXT_CHARS) +
    "\n\n=== GENERATED TEMPLATE ===\n" +
    template.slice(0, MAX_CONTEXT_CHARS)
  );
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/** Split a reply into prose + an optional proposed full template. */
export function parseChatReply(content: string): {
  reply: string;
  proposedTemplate?: string;
} {
  const idx = content.indexOf(FIX_SENTINEL);
  if (idx === -1) return { reply: content.trim() };
  const reply = content.slice(0, idx).trim();
  const proposedTemplate = stripFences(content.slice(idx + FIX_SENTINEL.length));
  return {
    reply: reply || "Here's a proposed fix — review it before applying.",
    proposedTemplate: proposedTemplate || undefined,
  };
}
