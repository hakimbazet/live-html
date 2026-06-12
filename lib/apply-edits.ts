import type { EditMap, Field } from "./types";
import { encodeForAttr, encodeForTextNode, escapeJsString } from "./encoding";

function encodeForField(field: Field, value: string): string {
  switch (field.kind) {
    case "text":
      return encodeForTextNode(value);
    case "attr":
      return encodeForAttr(value, field.meta.quote ?? '"');
    case "script-string":
      return escapeJsString(value, field.meta.quote ?? "'");
    case "script-number": {
      // The UI validates numeric input; guard here so a bad value never
      // corrupts the script. Fall back to the original on NaN.
      const n = Number(value);
      return Number.isFinite(n) && value.trim() !== "" ? value.trim() : field.raw;
    }
  }
}

/**
 * Re-apply edits to the immutable original HTML by splicing each changed
 * field's span. Patches are applied in descending start order so earlier
 * offsets stay valid. Pure and synchronous; with no edits the output is
 * byte-identical to the input.
 */
export function applyEdits(
  originalHtml: string,
  fields: Field[],
  edits: EditMap
): string {
  const patches: { start: number; end: number; encoded: string }[] = [];

  for (const field of fields) {
    const value = edits[field.id];
    if (value === undefined || value === field.original) continue;
    patches.push({
      start: field.start,
      end: field.end,
      encoded: encodeForField(field, value),
    });
  }

  patches.sort((a, b) => b.start - a.start);

  let out = originalHtml;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.encoded + out.slice(p.end);
  }
  return out;
}
