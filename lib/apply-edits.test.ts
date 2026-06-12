import { describe, it, expect } from "vitest";
import { applyEdits } from "./apply-edits";
import type { Field } from "./types";

function field(partial: Partial<Field> & Pick<Field, "id" | "start" | "end" | "raw" | "original">): Field {
  return {
    kind: "text",
    label: "",
    breadcrumb: "",
    groupId: "g",
    meta: {},
    ...partial,
  };
}

const html = `<h1>Hello</h1><p>World</p><img src="a.png">`;

describe("applyEdits", () => {
  const fields: Field[] = [
    field({ id: "t:4", start: 4, end: 9, raw: "Hello", original: "Hello" }),
    field({ id: "t:17", start: 17, end: 22, raw: "World", original: "World" }),
    field({
      id: "a:src:36",
      kind: "attr",
      start: 36,
      end: 41,
      raw: "a.png",
      original: "a.png",
      meta: { quote: '"', attrName: "src" },
    }),
  ];

  it("is the identity with no edits", () => {
    expect(applyEdits(html, fields, {})).toBe(html);
  });

  it("changes only the edited span", () => {
    const out = applyEdits(html, fields, { "t:4": "Hi" });
    expect(out).toBe(`<h1>Hi</h1><p>World</p><img src="a.png">`);
  });

  it("applies multiple edits in descending order correctly", () => {
    const out = applyEdits(html, fields, {
      "t:4": "Hey",
      "t:17": "Earth",
      "a:src:36": "b.png",
    });
    expect(out).toBe(`<h1>Hey</h1><p>Earth</p><img src="b.png">`);
  });

  it("entity-encodes text edits", () => {
    const out = applyEdits(html, fields, { "t:4": "A & B < C" });
    expect(out).toContain("A &amp; B &lt; C");
  });

  it("ignores edits equal to original", () => {
    expect(applyEdits(html, fields, { "t:4": "Hello" })).toBe(html);
  });
});
