import { describe, it, expect } from "vitest";
import { runSanityChecks } from "./sanity";

const original = `<!DOCTYPE html><html><body>
  <div class="card"><div class="value">$1.24M</div></div>
  <table data-table="sales"><thead><tr><th>Q</th><th>Rev</th></tr></thead>
  <tbody><tr><td>Q1</td><td>280</td></tr></tbody></table>
  <p>We grew this year.</p>
</body></html>`;

const goodTemplate = `<!DOCTYPE html><html><body>
  <div class="card"><div class="value" data-bind="kpi:total_revenue"></div></div>
  <table data-table="sales"><thead><tr><th>Q</th><th>Rev</th></tr></thead>
  <tbody data-table-body></tbody></table>
  <p data-bind="narrative:summary"></p>
</body></html>`;

const goodData = JSON.stringify({
  version: 1,
  meta: { title: "T" },
  kpis: [{ key: "total_revenue", label: "Total Revenue", value: "$1.24M", format: "text" }],
  tables: {
    sales: { label: "Sales", columns: ["Q", "Rev"], rows: [["Q1", 280]] },
  },
  narrative: [{ key: "summary", label: "Summary", text: "We grew this year." }],
});

describe("runSanityChecks", () => {
  it("passes a clean migration", () => {
    const { issues, data } = runSanityChecks(original, goodTemplate, goodData);
    expect(issues).toEqual([]);
    expect(data?.kpis[0].key).toBe("total_revenue");
  });

  it("flags a template ref with no matching data key", () => {
    const tmpl = goodTemplate.replace("kpi:total_revenue", "kpi:missing_key");
    const { issues } = runSanityChecks(original, tmpl, goodData);
    expect(issues.some((i) => i.includes("kpi:missing_key"))).toBe(true);
  });

  it("flags an orphan data key never bound in the template", () => {
    const data = JSON.parse(goodData);
    data.kpis.push({ key: "ghost", label: "G", value: 1, format: "number:0" });
    const { issues } = runSanityChecks(original, goodTemplate, JSON.stringify(data));
    expect(issues.some((i) => i.includes("ghost"))).toBe(true);
  });

  it("flags invalid JSON and stops", () => {
    const { issues, data } = runSanityChecks(original, goodTemplate, "{broken");
    expect(data).toBeUndefined();
    expect(issues[0]).toMatch(/not valid JSON/);
  });

  it("flags a length-truncated finish reason", () => {
    const { issues } = runSanityChecks(original, goodTemplate, goodData, "length");
    expect(issues.some((i) => i.includes("truncated"))).toBe(true);
  });

  it("validates chart-styles keys against chart keys", () => {
    const tmpl =
      goodTemplate.replace(
        "</body>",
        `<canvas data-chart="rev" data-chart-type="bar"></canvas>
         <script type="application/json" id="chart-styles">{"rev":{},"stray":{}}</script></body>`
      );
    const data = JSON.parse(goodData);
    data.charts = { rev: { label: "Rev", columns: ["x", "y"], rows: [["a", 1]] } };
    const { issues } = runSanityChecks(original, tmpl, JSON.stringify(data));
    expect(issues.some((i) => i.includes("stray"))).toBe(true);
  });
});
