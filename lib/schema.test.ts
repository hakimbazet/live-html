import { describe, it, expect } from "vitest";
import { DataSchema, parseData } from "./schema";

// The sample document from the PoC plan (§3).
const sample = {
  version: 1,
  meta: { title: "MAYBANK Equity Dashboard", sourceFile: "maybank.html" },
  kpis: [
    { key: "target_price", label: "Target Price", value: 11.2, format: "currency:MYR:2" },
    { key: "upside", label: "Upside", value: 0.124, format: "percent:1" },
    { key: "rating", label: "Rating", value: "BUY", format: "text" },
  ],
  charts: {
    revenue_trend: {
      label: "Revenue Trend (RM bn)",
      columns: ["period", "revenue", "net_profit"],
      rows: [
        ["FY22", 25.4, 8.1],
        ["FY23", 27.1, 9.3],
        ["FY24", 29.8, 10.0],
      ],
    },
  },
  tables: {
    peer_comparison: {
      label: "Peer Comparison",
      columns: ["company", "pe", "pb", "div_yield"],
      rows: [
        ["Maybank", 11.2, 1.3, "6.1%"],
        ["CIMB", 9.8, 0.9, "5.4%"],
      ],
    },
  },
  narrative: [
    {
      key: "investment_thesis",
      label: "Investment Thesis",
      text: "We maintain BUY with a target price of RM 11.20...",
      mentions: ["target_price", "rating"],
    },
  ],
  labels: [{ key: "as_of_date", value: "As of 12 June 2026" }],
};

describe("DataSchema", () => {
  it("round-trips the sample document", () => {
    const parsed = DataSchema.parse(sample);
    expect(parsed).toEqual(sample);
  });

  it("applies defaults for omitted optional collections", () => {
    const parsed = DataSchema.parse({ version: 1, meta: { title: "x" } });
    expect(parsed.kpis).toEqual([]);
    expect(parsed.charts).toEqual({});
    expect(parsed.tables).toEqual({});
    expect(parsed.narrative).toEqual([]);
    expect(parsed.labels).toEqual([]);
  });

  it("defaults narrative mentions to an empty array", () => {
    const parsed = DataSchema.parse({
      version: 1,
      meta: { title: "x" },
      narrative: [{ key: "a", label: "A", text: "hello" }],
    });
    expect(parsed.narrative[0].mentions).toEqual([]);
  });

  it("rejects a wrong version literal", () => {
    expect(DataSchema.safeParse({ version: 2, meta: { title: "x" } }).success).toBe(false);
  });

  it("parseData reports invalid JSON", () => {
    const r = parseData("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/);
  });

  it("parseData reports schema failures", () => {
    const r = parseData(JSON.stringify({ version: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schema/);
  });
});
