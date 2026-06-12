import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractDom } from "./index";
import { mapScriptFields } from "./script-fields";
import { applyEdits } from "../apply-edits";
import type { RawScriptField } from "../types";

const html = readFileSync(
  resolve(__dirname, "../../fixtures/sample-dashboard.html"),
  "utf-8"
);

describe("mapScriptFields", () => {
  const { scripts } = extractDom(html);

  it("maps numeric and string literals to verified offsets", () => {
    const raw: RawScriptField[] = [
      {
        scriptIndex: 0,
        label: "Revenue 2024 › data[3]",
        group: "Chart: Quarterly Revenue",
        valueType: "number",
        literal: "310.5",
        anchor: "340, 310.5]",
      },
      {
        scriptIndex: 0,
        label: "labels[0]",
        group: "Chart: Quarterly Revenue",
        valueType: "string",
        literal: "Q1",
        anchor: "labels: ['Q1'",
      },
      {
        scriptIndex: 0,
        label: "Chart title",
        group: "Chart: Quarterly Revenue",
        valueType: "string",
        literal: "Quarterly Revenue",
        anchor: "text: 'Quarterly Revenue'",
      },
    ];
    const { fields, dropped } = mapScriptFields(html, scripts, raw);
    expect(dropped).toBe(0);
    expect(fields.length).toBe(3);
    for (const f of fields) {
      expect(html.slice(f.start, f.end)).toBe(f.raw);
    }
    const num = fields.find((f) => f.raw === "310.5")!;
    expect(num.kind).toBe("script-number");
    const str = fields.find((f) => f.raw === "Q1")!;
    expect(str.kind).toBe("script-string");
    expect(str.meta.quote).toBe("'");
  });

  it("drops fields with ambiguous anchors", () => {
    const raw: RawScriptField[] = [
      {
        scriptIndex: 0,
        label: "x",
        group: "Chart",
        valueType: "number",
        literal: "310",
        anchor: "310", // 310 occurs multiple times in the script → ambiguous
      },
    ];
    const { dropped } = mapScriptFields(html, scripts, raw);
    expect(dropped).toBe(1);
  });

  it("drops fields whose literal does not match source", () => {
    const raw: RawScriptField[] = [
      {
        scriptIndex: 0,
        label: "x",
        group: "Chart",
        valueType: "number",
        literal: "999",
        anchor: "data: [280, 310, 340, 310.5]",
      },
    ];
    const { dropped, fields } = mapScriptFields(html, scripts, raw);
    expect(fields.length).toBe(0);
    expect(dropped).toBe(1);
  });

  it("edits a chart data value touching only its span", () => {
    const raw: RawScriptField[] = [
      {
        scriptIndex: 0,
        label: "Revenue 2024 › data[0]",
        group: "Chart: Quarterly Revenue",
        valueType: "number",
        literal: "280",
        anchor: "data: [280, 310, 340, 310.5]",
      },
    ];
    const { fields } = mapScriptFields(html, scripts, raw);
    expect(fields.length).toBe(1);
    const out = applyEdits(html, fields, { [fields[0].id]: "5000" });
    expect(out).toContain("data: [5000, 310, 340, 310.5]");
    expect(out.length).toBe(html.length + 1);
  });
});
