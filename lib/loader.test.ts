// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { LOADER_SCRIPT, hydrate } from "./loader";

const data = {
  version: 1,
  meta: { title: "T" },
  kpis: [
    { key: "total_revenue", label: "Total Revenue", value: "$1.24M", format: "text" },
    { key: "deals", label: "Deals", value: 348, format: "number:0" },
  ],
  charts: {},
  tables: {
    sales: { label: "Sales", columns: ["Quarter", "Revenue"], rows: [["Q1", 280], ["Q2", 310]] },
  },
  narrative: [{ key: "summary", label: "Summary", text: "We grew this year.", mentions: [] }],
  labels: [{ key: "as_of", value: "As of today" }],
};

function runLoader() {
  document.body.innerHTML = `
    <div class="value" data-bind="kpi:total_revenue"></div>
    <div class="deals" data-bind="kpi:deals"></div>
    <div class="date" data-bind="label:as_of"></div>
    <p data-bind="narrative:summary"></p>
    <table data-table="sales"><tbody data-table-body></tbody></table>
    <script type="application/json" id="ei2-data">${JSON.stringify(data)}</script>
  `;
  new Function(LOADER_SCRIPT)();
}

describe("loader runtime", () => {
  beforeEach(() => runLoader());

  it("binds a text KPI verbatim", () => {
    expect(document.querySelector(".value")?.textContent).toBe("$1.24M");
  });

  it("formats a numeric KPI", () => {
    expect(document.querySelector(".deals")?.textContent).toBe("348");
  });

  it("binds a label", () => {
    expect(document.querySelector(".date")?.textContent).toBe("As of today");
  });

  it("binds a narrative paragraph", () => {
    expect(document.querySelector("p")?.textContent).toBe("We grew this year.");
  });

  it("fills a table body from sheet rows", () => {
    const html = document.querySelector("[data-table-body]")?.innerHTML ?? "";
    expect(html).toContain("<td>Q1</td>");
    expect(html).toContain("<td>280</td>");
    expect(html).toContain("<td>Q2</td>");
  });
});

describe("hydrate", () => {
  it("inlines the data block and loader before </body>", () => {
    const out = hydrate("<html><body><h1>hi</h1></body></html>", data);
    expect(out).toContain('id="ei2-data"');
    expect(out).toContain("<script>(");
    expect(out.indexOf("ei2-data")).toBeLessThan(out.indexOf("</body>"));
  });

  it("escapes </ inside the inlined JSON", () => {
    const out = hydrate("<body></body>", { version: 1, meta: { title: "</script>" } });
    expect(out).not.toContain("</script></script>");
    expect(out).toContain("<\\/script>");
  });
});
