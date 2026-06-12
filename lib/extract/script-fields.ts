import type {
  ExtractResult,
  Field,
  FieldGroup,
  QuoteChar,
  RawScriptField,
} from "../types";
import type { InlineScript } from "./index";
import { unescapeJsString } from "../encoding";

function indexOfUnique(haystack: string, needle: string): number {
  const first = haystack.indexOf(needle);
  if (first === -1) return -1;
  if (haystack.indexOf(needle, first + 1) !== -1) return -1; // ambiguous
  return first;
}

function isNumberBoundaryOk(content: string, start: number, end: number): boolean {
  const before = content[start - 1];
  const after = content[end];
  const bad = (c: string | undefined) => c !== undefined && /[\d.]/.test(c);
  return !bad(before) && !bad(after);
}

/**
 * Map LLM-returned {literal, anchor} script fields to verified absolute offsets
 * against the original HTML. Fields whose anchor/literal can't be located
 * unambiguously, or whose computed span doesn't match the source, are dropped.
 *
 * Returns the built fields, groups, and the count of dropped entries.
 */
export function mapScriptFields(
  html: string,
  scripts: InlineScript[],
  raw: RawScriptField[]
): ExtractResult & { dropped: number } {
  const byIndex = new Map(scripts.map((s) => [s.index, s]));
  const fields: Field[] = [];
  const seen = new Set<number>();
  let dropped = 0;

  for (const r of raw) {
    const script = byIndex.get(r.scriptIndex);
    if (!script || !r.literal || !r.anchor) {
      dropped++;
      continue;
    }
    const content = script.content;

    const anchorAt = indexOfUnique(content, r.anchor);
    if (anchorAt === -1) {
      dropped++;
      continue;
    }
    const anchorEnd = anchorAt + r.anchor.length;
    const region = content.slice(anchorAt, anchorEnd);

    const litRelInRegion = indexOfUnique(region, r.literal);
    if (litRelInRegion === -1) {
      dropped++;
      continue;
    }
    const relStart = anchorAt + litRelInRegion;
    const relEnd = relStart + r.literal.length;

    if (r.valueType === "number" && !isNumberBoundaryOk(content, relStart, relEnd)) {
      dropped++;
      continue;
    }

    const absStart = script.contentStart + relStart;
    const absEnd = script.contentStart + relEnd;

    // Verify against source and reject overlaps with already-built fields.
    if (html.slice(absStart, absEnd) !== r.literal || seen.has(absStart)) {
      dropped++;
      continue;
    }
    seen.add(absStart);

    let quote: QuoteChar = null;
    let original = r.literal;
    if (r.valueType === "string") {
      const prev = content[relStart - 1];
      if (prev === '"' || prev === "'" || prev === "`") quote = prev;
      original = unescapeJsString(r.literal);
    }

    fields.push({
      id: `s:${absStart}`,
      kind: r.valueType === "number" ? "script-number" : "script-string",
      start: absStart,
      end: absEnd,
      raw: r.literal,
      original,
      label: r.label || (r.valueType === "number" ? "Value" : "Text"),
      breadcrumb: r.group ? `${r.group} › script` : "Chart data",
      groupId: "", // filled in below
      meta: { scriptIndex: r.scriptIndex, quote },
    });
  }

  const groups = buildScriptGroups(fields, raw);
  return { fields, groups, dropped };
}

function buildScriptGroups(fields: Field[], raw: RawScriptField[]): FieldGroup[] {
  // Re-derive each field's group label from the matching raw entry by id order.
  // fields preserve raw order (minus drops), so align by walking raw and fields.
  const groupMap = new Map<string, FieldGroup>();
  // Build a quick lookup from literal+scriptIndex isn't unique; instead store
  // the group label on the field via breadcrumb prefix we set above.
  for (const f of fields) {
    const label = f.breadcrumb.replace(/ › script$/, "") || "Chart data";
    const id = `sg:${label}`;
    let group = groupMap.get(id);
    if (!group) {
      group = {
        id,
        label,
        kind: "chart",
        order: f.start,
        fieldIds: [],
      };
      groupMap.set(id, group);
    }
    group.fieldIds.push(f.id);
    f.groupId = id;
  }
  void raw;
  return [...groupMap.values()].sort((a, b) => a.order - b.order);
}
