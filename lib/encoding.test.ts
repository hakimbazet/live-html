import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  encodeForAttr,
  encodeForTextNode,
  escapeJsString,
  unescapeJsString,
} from "./encoding";

describe("decodeHtmlEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeHtmlEntities("R&amp;D &lt;3 &#65; &#x41;")).toBe("R&D <3 A A");
  });
  it("leaves unknown entities intact", () => {
    expect(decodeHtmlEntities("a &bogus; b")).toBe("a &bogus; b");
  });
});

describe("encodeForTextNode", () => {
  it("escapes &, <, > only", () => {
    expect(encodeForTextNode('a & b < c > d "q"')).toBe(
      'a &amp; b &lt; c &gt; d "q"'
    );
  });
});

describe("encodeForAttr", () => {
  it("escapes the active double quote", () => {
    expect(encodeForAttr('say "hi" & <', '"')).toBe("say &quot;hi&quot; &amp; &lt;");
  });
  it("escapes the active single quote", () => {
    expect(encodeForAttr("it's & ok", "'")).toBe("it&#39;s &amp; ok");
  });
});

describe("escapeJsString / unescapeJsString", () => {
  it("round-trips single-quote strings", () => {
    const v = `O'Brien said "hi"\nnext`;
    const escaped = escapeJsString(v, "'");
    expect(escaped).toBe(`O\\'Brien said "hi"\\nnext`);
    expect(unescapeJsString(escaped)).toBe(v);
  });
  it("escapes backtick and template interpolation", () => {
    const v = "a `b` ${c}";
    expect(escapeJsString(v, "`")).toBe("a \\`b\\` \\${c}");
  });
  it("escapes backslashes", () => {
    expect(escapeJsString("a\\b", '"')).toBe("a\\\\b");
  });
});
