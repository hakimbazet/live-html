import type { QuoteChar } from "./types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode the subset of HTML entities that matter for editable text/attribute
 * values. parse5 already decodes most values it hands back; this exists for the
 * raw-source paths and for tests.
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return m;
    }
    const named = NAMED_ENTITIES[body];
    return named !== undefined ? named : m;
  });
}

/** Encode a value for insertion into a text node (escapes &, <, >). */
export function encodeForTextNode(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Encode a value for insertion into an attribute value, escaping the active
 * quote character so it can't terminate the attribute early. The span we
 * replace is the inner value only, so the surrounding quotes are preserved.
 */
export function encodeForAttr(value: string, quote: QuoteChar): string {
  let out = value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  if (quote === '"') {
    out = out.replace(/"/g, "&quot;");
  } else if (quote === "'") {
    out = out.replace(/'/g, "&#39;");
  } else {
    // Unquoted attribute: escape both quotes and whitespace-ish chars that
    // would otherwise terminate the value.
    out = out
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/ /g, "&#32;");
  }
  return out;
}

/** Escape a value for insertion inside a JS string literal of the given quote. */
export function escapeJsString(value: string, quote: QuoteChar): string {
  let out = value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  if (quote === '"') {
    out = out.replace(/"/g, '\\"');
  } else if (quote === "'") {
    out = out.replace(/'/g, "\\'");
  } else if (quote === "`") {
    out = out.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  }
  return out;
}

/** Inverse of escapeJsString — decode a JS string literal body to a plain value. */
export function unescapeJsString(value: string): string {
  return value.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, body) => {
    if (body[0] === "u" || body[0] === "x") {
      const hex = body[0] === "u" && body[1] === "{" ? body.slice(2, -1) : body.slice(1);
      const code = parseInt(hex, 16);
      if (Number.isFinite(code)) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return m;
    }
    switch (body) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return body; // \\ \" \' \` \$ etc -> the literal char
    }
  });
}
