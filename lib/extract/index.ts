import type { ExtractResult, Field, FieldGroup } from "../types";
import { isElement, isTextNode, parseHtml, walk } from "./parse";
import type { P5Element } from "./parse";
import { buildTextField, type PreField } from "./text-fields";
import { buildAttrFields } from "./attr-fields";
import { buildBreadcrumb, resolveGroup } from "./grouping";

const MAX_FIELDS = 2000;

export interface InlineScript {
  index: number;
  content: string;
  /** Absolute offset of the script's text content in the HTML. */
  contentStart: number;
}

export interface DomExtraction extends ExtractResult {
  scripts: InlineScript[];
  truncated: boolean;
}

/**
 * Deterministic client-side extraction of editable text and attribute fields,
 * plus collection of inline <script> contents for downstream LLM extraction.
 */
export function extractDom(html: string): DomExtraction {
  const doc = parseHtml(html);
  const pre: PreField[] = [];
  const scripts: InlineScript[] = [];

  walk(doc, {
    onElement(el, ancestors) {
      const tag = el.tagName.toLowerCase();
      if (tag === "script") {
        collectInlineScript(html, el, scripts);
        return false; // do not descend
      }
      for (const f of buildAttrFields(html, el, ancestors)) pre.push(f);
    },
    onText(node, ancestors) {
      const f = buildTextField(html, node, ancestors);
      if (f) pre.push(f);
    },
  });

  const { fields, groups } = assembleFields(html, pre);
  const truncated = fields.length >= MAX_FIELDS;

  return { fields, groups, scripts, truncated };
}

function collectInlineScript(
  html: string,
  el: P5Element,
  scripts: InlineScript[]
): void {
  // Skip external scripts (they have a src attribute).
  if (el.attrs.some((a) => a.name === "src")) return;
  const child = el.childNodes.find((c) => isTextNode(c));
  if (!child) return;
  const loc = (child as { sourceCodeLocation?: { startOffset: number; endOffset: number } })
    .sourceCodeLocation;
  if (!loc) return;
  const content = html.slice(loc.startOffset, loc.endOffset);
  if (!content.trim()) return;
  scripts.push({ index: scripts.length, content, contentStart: loc.startOffset });
}

/**
 * Convert PreFields into Field objects with ids, breadcrumbs and grouping;
 * enforce the offset invariants (sorted, non-overlapping, slice === raw).
 */
function assembleFields(
  html: string,
  pre: PreField[]
): { fields: Field[]; groups: FieldGroup[] } {
  const sorted = [...pre].sort((a, b) => a.start - b.start);
  const groupMap = new Map<string, FieldGroup>();
  const fields: Field[] = [];
  let lastEnd = -1;

  for (const p of sorted) {
    if (fields.length >= MAX_FIELDS) break;
    // Invariant checks.
    if (p.start < lastEnd) continue; // overlap — drop
    if (html.slice(p.start, p.end) !== p.raw) continue; // location mismatch — drop

    const g = resolveGroup([...p.ancestors, p.parent]);
    let group = groupMap.get(g.id);
    if (!group) {
      group = { id: g.id, label: g.label, kind: g.kind, order: g.order, fieldIds: [] };
      groupMap.set(g.id, group);
    }

    const id =
      p.kind === "attr"
        ? `a:${p.meta.attrName}:${p.start}`
        : `t:${p.start}`;

    const field: Field = {
      id,
      kind: p.kind,
      start: p.start,
      end: p.end,
      raw: p.raw,
      original: p.original,
      label: p.label,
      breadcrumb: buildBreadcrumb(group.label, p.parent),
      groupId: group.id,
      meta: p.meta,
    };
    fields.push(field);
    group.fieldIds.push(id);
    lastEnd = p.end;
  }

  const groups = [...groupMap.values()].sort((a, b) => a.order - b.order);
  return { fields, groups };
}

export { isElement };
