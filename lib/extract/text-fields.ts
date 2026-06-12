import type { FieldKind, FieldMeta } from "../types";
import type { P5Element, P5TextNode } from "./parse";
import { inferTextLabel } from "./grouping";

/** A field before group assignment; carries its parse context for grouping. */
export interface PreField {
  kind: FieldKind;
  start: number;
  end: number;
  raw: string;
  original: string;
  label: string;
  meta: FieldMeta;
  parent: P5Element;
  ancestors: P5Element[];
}

/**
 * Build a text-node field, trimming the editable span to the non-whitespace
 * region so original indentation is preserved on export. Returns null for
 * whitespace-only nodes or nodes without source location.
 */
export function buildTextField(
  html: string,
  node: P5TextNode,
  ancestors: P5Element[]
): PreField | null {
  const loc = node.sourceCodeLocation;
  if (!loc) return null;
  const parent = ancestors[ancestors.length - 1];
  if (!parent) return null;

  const rawFull = html.slice(loc.startOffset, loc.endOffset);
  const trimmedStart = rawFull.length - rawFull.trimStart().length;
  const trimmedEnd = rawFull.trimEnd().length;
  if (trimmedEnd <= trimmedStart) return null; // whitespace only

  const start = loc.startOffset + trimmedStart;
  const end = loc.startOffset + trimmedEnd;
  const raw = html.slice(start, end);

  // node.value is the parse5-decoded text; trim to match the span.
  const original = node.value.trim();
  if (!original) return null;

  return {
    kind: "text",
    start,
    end,
    raw,
    original,
    label: inferTextLabel(parent, original),
    meta: { tag: parent.tagName.toLowerCase() },
    parent,
    ancestors: [...ancestors],
  };
}
