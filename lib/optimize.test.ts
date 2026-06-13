import { describe, it, expect } from "vitest";
import { applyMerges } from "./optimize";
import { DataSchema } from "./schema";

// Pad both docs so the marker bytes are negligible against the sanity
// byte-length band (mirrors a realistically sized dashboard).
const filler = "<!-- " + "x".repeat(800) + " -->";
const original = `<!DOCTYPE html><html><head>${filler}</head><body><div class="a">$1.24M</div><div class="b">$1.24M</div></body></html>`;
const template = `<!DOCTYPE html><html><head>${filler}</head><body><div class="a" data-bind="kpi:revenue"></div><div class="b" data-bind="kpi:total_rev"></div></body></html>`;

const data = DataSchema.parse({
  version: 1,
  meta: { title: "T" },
  kpis: [
    { key: "revenue", label: "Revenue", value: "$1.24M", format: "text" },
    { key: "total_rev", label: "Total Revenue", value: "$1.24M", format: "text" },
  ],
});

describe("applyMerges", () => {
  it("rewires duplicate bindings to the canonical key and drops the duplicate entry", () => {
    const r = applyMerges(original, template, data, [
      { type: "kpi", canonical: "revenue", duplicates: ["total_rev"], reason: "" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.removed).toBe(1);
    expect(r.data.kpis.map((k) => k.key)).toEqual(["revenue"]);
    expect(r.template).not.toContain("kpi:total_rev");
    expect((r.template.match(/data-bind="kpi:revenue"/g) ?? []).length).toBe(2);
  });

  it("leaves the inputs untouched (no mutation of the passed data)", () => {
    applyMerges(original, template, data, [
      { type: "kpi", canonical: "revenue", duplicates: ["total_rev"], reason: "" },
    ]);
    expect(data.kpis.length).toBe(2);
  });

  it("rejects a group whose canonical key does not exist", () => {
    const r = applyMerges(original, template, data, [
      { type: "kpi", canonical: "nope", duplicates: ["total_rev"], reason: "" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("does not exist"))).toBe(true);
  });

  it("rejects a key listed as both canonical and duplicate", () => {
    const r = applyMerges(original, template, data, [
      { type: "kpi", canonical: "revenue", duplicates: ["revenue"], reason: "" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("both canonical and duplicate"))).toBe(true);
  });

  it("rejects a key reused across two groups", () => {
    const r = applyMerges(original, template, data, [
      { type: "kpi", canonical: "revenue", duplicates: ["total_rev"], reason: "" },
      { type: "kpi", canonical: "total_rev", duplicates: ["revenue"], reason: "" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("more than one group"))).toBe(true);
  });
});
