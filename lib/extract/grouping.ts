import type { P5Element, P5Node } from "./parse";
import { getAttr, isElement, isTextNode } from "./parse";

const CARD_CLASS_RE =
  /\b(card|panel|section|kpi|stat|metric|widget|tile|chart|box|cell|tile)\b/i;

function tagOf(el: P5Element): string {
  return el.tagName.toLowerCase();
}

function getChildren(node: P5Node): P5Node[] {
  return "childNodes" in node ? (node.childNodes as P5Node[]) : [];
}

function elementText(el: P5Element): string {
  let out = "";
  const visit = (n: P5Node) => {
    if (isTextNode(n)) out += n.value;
    else for (const c of getChildren(n)) visit(c);
  };
  for (const c of getChildren(el)) visit(c);
  return out.replace(/\s+/g, " ").trim();
}

function humanize(raw: string): string {
  const cleaned = raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function findHeadingText(el: P5Element): string | null {
  let found: string | null = null;
  const visit = (n: P5Node) => {
    if (found) return;
    if (isElement(n)) {
      if (/^h[1-6]$/.test(tagOf(n))) {
        const t = elementText(n);
        if (t) {
          found = t;
          return;
        }
      }
      for (const c of getChildren(n)) visit(c);
    }
  };
  for (const c of getChildren(el)) visit(c);
  return found;
}

export interface GroupResolution {
  /** Stable group id derived from the container, or "misc". */
  id: string;
  label: string;
  kind: "section" | "misc";
  /** Source start offset of the container (for ordering), or Infinity. */
  order: number;
}

/**
 * Walk up the ancestor chain to the nearest meaningful container and derive a
 * human-readable group label for it.
 */
export function resolveGroup(ancestors: P5Element[]): GroupResolution {
  // Priority tiers, highest first. We pick the nearest match within the
  // highest non-empty tier, so a labelled <section> wins over an inner ".card".
  let semantic: P5Element | null = null; // section/article/main or aria-label
  let card: P5Element | null = null; // card-ish class
  let identified: P5Element | null = null; // has id

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const el = ancestors[i];
    const tag = tagOf(el);
    if (tag === "body" || tag === "html") break;

    if (!semantic) {
      if (tag === "section" || tag === "article" || tag === "main" || getAttr(el, "aria-label")) {
        semantic = el;
      }
    }
    if (!card && CARD_CLASS_RE.test(getAttr(el, "class") ?? "")) card = el;
    if (!identified && getAttr(el, "id")) identified = el;
  }

  const container = semantic ?? card ?? identified;

  if (!container) {
    return { id: "misc", label: "Other content", kind: "misc", order: Infinity };
  }

  const start = container.sourceCodeLocation?.startOffset ?? Infinity;
  const id = `g:${start}`;

  const aria = getAttr(container, "aria-label");
  const heading = findHeadingText(container);
  const id_ = getAttr(container, "id");
  const cls = getAttr(container, "class") ?? "";
  const clsMatch = cls.match(CARD_CLASS_RE);

  let label: string;
  if (aria) label = aria.trim();
  else if (heading) label = heading.length > 48 ? heading.slice(0, 47) + "…" : heading;
  else if (id_) label = humanize(id_);
  else if (clsMatch) label = humanize(clsMatch[0]);
  else label = "Section";

  return { id, label, kind: "section", order: start };
}

function parentElement(node: P5Node): P5Element | null {
  const p = (node as { parentNode?: P5Node }).parentNode;
  return p && isElement(p) ? p : null;
}

function childElements(el: P5Element): P5Element[] {
  return getChildren(el).filter(isElement);
}

/** Resolve table header text for the column a td/th sits in, if any. */
function tableCellLabel(cell: P5Element): string | null {
  const row = parentElement(cell);
  if (!row || tagOf(row) !== "tr") return null;
  const cells = childElements(row).filter((c) => /^t[dh]$/.test(tagOf(c)));
  const colIndex = cells.indexOf(cell);

  // Find the enclosing table.
  let table: P5Element | null = row;
  while (table && tagOf(table) !== "table") table = parentElement(table);
  if (!table) return null;

  // Header cells: first thead row, else first row of the table.
  let headerCells: P5Element[] = [];
  const thead = childElements(table).find((c) => tagOf(c) === "thead");
  if (thead) {
    const headRow = childElements(thead).find((c) => tagOf(c) === "tr");
    if (headRow) headerCells = childElements(headRow).filter((c) => /^t[dh]$/.test(tagOf(c)));
  }

  if (tagOf(cell) === "th") {
    return "Column header";
  }

  const header = headerCells[colIndex];
  const headerText = header ? elementText(header) : null;

  // Row number within the body.
  const body = parentElement(row);
  let rowIndex = 0;
  if (body) {
    const rows = childElements(body).filter((c) => tagOf(c) === "tr");
    rowIndex = rows.indexOf(row) + 1;
  }

  if (headerText) return `${headerText} — row ${rowIndex}`;
  return `Cell — row ${rowIndex}`;
}

const NUMERIC_RE = /^[\$€£]?\s?-?[\d,.]+\s?[%KMB]?$/;

/** Infer a human-readable label for a text-node field. */
export function inferTextLabel(parent: P5Element, value: string): string {
  const tag = tagOf(parent);

  if (/^h[1-6]$/.test(tag)) return "Heading";
  if (tag === "title") return "Page title";
  if (tag === "button") return "Button text";
  if (tag === "a") return "Link text";
  if (tag === "label") return "Label";
  if (tag === "li") return "List item";
  if (tag === "td" || tag === "th") {
    const t = tableCellLabel(parent);
    if (t) return t;
  }

  // KPI value pairing: a short numeric value next to a short text sibling.
  if (NUMERIC_RE.test(value.trim()) && value.trim().length <= 16) {
    const container = parentElement(parent) ?? parent;
    const labelText = findKpiLabel(container, parent);
    if (labelText) return `${labelText} value`;
  }

  const preview = value.trim().replace(/\s+/g, " ");
  return preview.length > 28 ? preview.slice(0, 27) + "…" : preview || "Text";
}

/** Find a short descriptive sibling for a numeric KPI value. */
function findKpiLabel(container: P5Element, valueParent: P5Element): string | null {
  for (const child of childElements(container)) {
    if (child === valueParent) continue;
    const t = elementText(child);
    if (t && t.length <= 40 && !NUMERIC_RE.test(t)) return t;
  }
  return null;
}

export function inferAttrLabel(tag: string, attrName: string): string {
  if (tag === "img" && attrName === "src") return "Image source";
  if (tag === "img" && attrName === "alt") return "Image alt text";
  if (tag === "a" && attrName === "href") return "Link URL";
  return `${humanize(tag)} ${attrName}`;
}

export function buildBreadcrumb(groupLabel: string, parent: P5Element): string {
  const cls = getAttr(parent, "class");
  const tag = tagOf(parent);
  const tail = cls ? `${tag}.${cls.split(/\s+/)[0]}` : tag;
  return groupLabel === "Other content" ? tail : `${groupLabel} › ${tail}`;
}
