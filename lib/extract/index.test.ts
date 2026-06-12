import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractDom } from "./index";
import { applyEdits } from "../apply-edits";

const html = readFileSync(
  resolve(__dirname, "../../fixtures/sample-dashboard.html"),
  "utf-8"
);

describe("extractDom", () => {
  const result = extractDom(html);

  it("satisfies the slice === raw invariant for every field", () => {
    for (const f of result.fields) {
      expect(html.slice(f.start, f.end)).toBe(f.raw);
    }
  });

  it("produces non-overlapping, ascending spans", () => {
    let last = -1;
    for (const f of [...result.fields].sort((a, b) => a.start - b.start)) {
      expect(f.start).toBeGreaterThanOrEqual(last);
      last = f.end;
    }
  });

  it("extracts the page title and headings", () => {
    const labels = result.fields.map((f) => f.original);
    expect(labels).toContain("Quarterly Sales Dashboard");
    expect(labels).toContain("Revenue by Quarter");
  });

  it("extracts KPI values with paired labels", () => {
    const revenue = result.fields.find((f) => f.original === "$1.24M");
    expect(revenue).toBeDefined();
    expect(revenue!.label).toContain("Total Revenue");
  });

  it("labels table cells by column header and row", () => {
    const cell = result.fields.find((f) => f.original === "$280K");
    expect(cell).toBeDefined();
    expect(cell!.label).toBe("Revenue — row 1");
  });

  it("extracts img src and a href attributes", () => {
    const src = result.fields.find(
      (f) => f.kind === "attr" && f.original === "https://example.com/logo.png"
    );
    expect(src).toBeDefined();
    const href = result.fields.find(
      (f) => f.kind === "attr" && f.original === "https://example.com/report"
    );
    expect(href).toBeDefined();
  });

  it("collects the inline script but skips the external one", () => {
    expect(result.scripts.length).toBe(1);
    expect(result.scripts[0].content).toContain("new Chart");
    // verify contentStart points at the real content
    const s = result.scripts[0];
    expect(html.slice(s.contentStart, s.contentStart + s.content.length)).toBe(
      s.content
    );
  });

  it("groups KPI cards and sections", () => {
    const labels = result.groups.map((g) => g.label);
    expect(labels).toContain("Key Metrics");
  });

  it("round-trips with no edits (identity)", () => {
    expect(applyEdits(html, result.fields, {})).toBe(html);
  });

  it("edits a KPI value touching only its span", () => {
    const revenue = result.fields.find((f) => f.original === "$1.24M")!;
    const out = applyEdits(html, result.fields, { [revenue.id]: "$2.00M" });
    expect(out).toContain("$2.00M");
    expect(out.length).toBe(html.length + ("$2.00M".length - "$1.24M".length));
  });
});
