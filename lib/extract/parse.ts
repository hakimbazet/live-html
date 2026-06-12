import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

export type P5Node = DefaultTreeAdapterMap["node"];
export type P5Element = DefaultTreeAdapterMap["element"];
export type P5TextNode = DefaultTreeAdapterMap["textNode"];
export type P5Document = DefaultTreeAdapterMap["document"];

const SKIP_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "head", // <title> is handled explicitly below, but skip head metadata
]);

export function parseHtml(html: string): P5Document {
  return parse(html, { sourceCodeLocationInfo: true });
}

export function isElement(node: P5Node): node is P5Element {
  return "tagName" in node;
}

export function isTextNode(node: P5Node): node is P5TextNode {
  return node.nodeName === "#text";
}

function getChildNodes(node: P5Node): P5Node[] {
  return "childNodes" in node ? (node.childNodes as P5Node[]) : [];
}

export interface WalkVisitor {
  /** Called for every element. Return false to skip its subtree. */
  onElement?(el: P5Element, ancestors: P5Element[]): boolean | void;
  /** Called for every visited text node. */
  onText?(text: P5TextNode, ancestors: P5Element[]): void;
}

/**
 * Depth-first traversal carrying the ancestor element stack. Subtrees of
 * SKIP_TAGS are not descended into (their content is non-editable or handled
 * separately), except <title> which we surface as editable text.
 */
export function walk(doc: P5Document, visitor: WalkVisitor): void {
  const stack: P5Element[] = [];

  const visit = (node: P5Node) => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();
      const isTitle = tag === "title";

      if (SKIP_TAGS.has(tag) && !isTitle) {
        // Still let the visitor see <script> elements (for inline-script
        // collection) but do not descend into their text content here.
        visitor.onElement?.(node, stack);
        return;
      }

      const descend = visitor.onElement?.(node, stack);
      if (descend === false) return;

      // For <title>, its text child should be visited even though <title>
      // lives under <head> which we otherwise skip.
      stack.push(node);
      for (const child of getChildNodes(node)) visit(child);
      stack.pop();
      return;
    }

    if (isTextNode(node)) {
      visitor.onText?.(node, stack);
    }
  };

  for (const child of getChildNodes(doc)) visit(child);
}

export interface AttrValueSpan {
  start: number;
  end: number;
  quote: '"' | "'" | null;
  raw: string;
}

/**
 * Given the source span of a full attribute (`name="value"`), compute the
 * inner value span and its quote char. Returns null for boolean attributes
 * with no value.
 */
export function attrValueSpan(
  html: string,
  attrStart: number,
  attrEnd: number
): AttrValueSpan | null {
  const segment = html.slice(attrStart, attrEnd);
  const eq = segment.indexOf("=");
  if (eq === -1) return null;

  let i = eq + 1;
  while (i < segment.length && /\s/.test(segment[i])) i++;
  if (i >= segment.length) return null;

  const first = segment[i];
  if (first === '"' || first === "'") {
    const valueStart = i + 1;
    const close = segment.indexOf(first, valueStart);
    const valueEnd = close === -1 ? segment.length : close;
    return {
      start: attrStart + valueStart,
      end: attrStart + valueEnd,
      quote: first,
      raw: segment.slice(valueStart, valueEnd),
    };
  }

  // Unquoted value: runs to end of the attr span.
  return {
    start: attrStart + i,
    end: attrEnd,
    quote: null,
    raw: segment.slice(i),
  };
}

/** Collect text content of an element's descendant text nodes (decoded). */
export function elementText(el: P5Element): string {
  let out = "";
  const visit = (node: P5Node) => {
    if (isTextNode(node)) {
      out += node.value;
    } else {
      for (const child of getChildNodes(node)) visit(child);
    }
  };
  for (const child of getChildNodes(el)) visit(child);
  return out.trim();
}

export function getAttr(el: P5Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}
