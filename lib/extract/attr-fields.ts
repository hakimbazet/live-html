import type { AttrName } from "../types";
import type { PreField } from "./text-fields";
import type { P5Element } from "./parse";
import { attrValueSpan } from "./parse";
import { inferAttrLabel } from "./grouping";
import { decodeHtmlEntities } from "../encoding";

const TARGETS: Record<string, AttrName[]> = {
  img: ["src", "alt"],
  a: ["href"],
};

const LONG_VALUE = 2048;

/** Build editable fields for img[src|alt] and a[href] attributes. */
export function buildAttrFields(
  html: string,
  el: P5Element,
  ancestors: P5Element[]
): PreField[] {
  const tag = el.tagName.toLowerCase();
  const wanted = TARGETS[tag];
  if (!wanted) return [];

  const attrLocs = el.sourceCodeLocation?.attrs;
  if (!attrLocs) return [];

  const out: PreField[] = [];
  for (const name of wanted) {
    const loc = attrLocs[name];
    if (!loc) continue;
    const span = attrValueSpan(html, loc.startOffset, loc.endOffset);
    if (!span) continue;

    out.push({
      kind: "attr",
      start: span.start,
      end: span.end,
      raw: span.raw,
      original: decodeHtmlEntities(span.raw),
      label: inferAttrLabel(tag, name),
      meta: {
        tag,
        attrName: name,
        quote: span.quote,
        longValue: span.raw.length > LONG_VALUE,
      },
      parent: el,
      ancestors: [...ancestors],
    });
  }
  return out;
}
