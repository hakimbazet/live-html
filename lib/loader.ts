/**
 * Runtime loader. Injected as an inline <script> at hydrate time, right before
 * </body>, after a JSON data block. It is deterministic and dependency-free
 * (Chart.js, when present, comes from the dashboard's own CDN <script>).
 *
 * Authored as a raw string on purpose: the exact bytes must reach the browser
 * untouched. Serializing a TS function via `.toString()` would risk the
 * compiler down-levelling syntax (e.g. object spread) into helper calls that
 * don't exist in the injected scope. This snippet uses only ES2017-safe syntax,
 * no template literals and no spread, so it ships verbatim. It is exercised by
 * loader.test.ts running in jsdom.
 */
export const LOADER_SCRIPT = [
  "(function () {",
  "  var node = document.getElementById('ei2-data');",
  "  if (!node || !node.textContent) return;",
  "  var data = JSON.parse(node.textContent);",
  "  function fmt(value, format) {",
  "    var parts = (format || 'text').split(':');",
  "    var kind = parts[0], a = parts[1], b = parts[2];",
  "    if (kind === 'currency') return new Intl.NumberFormat('en-MY', { style: 'currency', currency: a, minimumFractionDigits: +b }).format(value);",
  "    if (kind === 'percent') return (value * 100).toFixed(+a) + '%';",
  "    if (kind === 'number') return new Intl.NumberFormat('en-MY', { maximumFractionDigits: +a }).format(value);",
  "    return String(value);",
  "  }",
  "  function index(list, out) { (list || []).forEach(function (e) { out[e.key] = e; }); return out; }",
  "  var kpis = index(data.kpis, {});",
  "  var labels = index(data.labels, {});",
  "  var narrative = index(data.narrative, {});",
  "  document.querySelectorAll('[data-bind]').forEach(function (el) {",
  "    var bind = (el.dataset.bind || '').split(':');",
  "    var type = bind[0], key = bind[1];",
  "    if (type === 'kpi' && kpis[key]) el.textContent = fmt(kpis[key].value, kpis[key].format);",
  "    else if (type === 'label' && labels[key]) el.textContent = labels[key].value;",
  "    else if (type === 'narrative' && narrative[key]) el.textContent = narrative[key].text;",
  "  });",
  "  document.querySelectorAll('[data-table]').forEach(function (t) {",
  "    var sheet = (data.tables || {})[t.dataset.table || ''];",
  "    if (!sheet) return;",
  "    var body = t.querySelector('[data-table-body]');",
  "    if (!body) return;",
  "    body.innerHTML = sheet.rows.map(function (r) {",
  "      return '<tr>' + r.map(function (c) { return '<td>' + (c == null ? '' : c) + '</td>'; }).join('') + '</tr>';",
  "    }).join('');",
  "  });",
  "  var stylesNode = document.getElementById('chart-styles');",
  "  var styles = stylesNode && stylesNode.textContent ? JSON.parse(stylesNode.textContent) : {};",
  "  if (window.Chart) {",
  "    document.querySelectorAll('[data-chart]').forEach(function (c) {",
  "      var key = c.dataset.chart || '';",
  "      var sheet = (data.charts || {})[key];",
  "      if (!sheet) return;",
  "      var style = styles[key] || {};",
  "      new window.Chart(c, {",
  "        type: c.dataset.chartType || 'bar',",
  "        data: {",
  "          labels: sheet.rows.map(function (r) { return r[0]; }),",
  "          datasets: sheet.columns.slice(1).map(function (col, i) {",
  "            return Object.assign({ label: col, data: sheet.rows.map(function (r) { return r[i + 1]; }) }, (style.datasets && style.datasets[i]) || {});",
  "          })",
  "        },",
  "        options: style.options || {}",
  "      });",
  "    });",
  "  }",
  "})();",
].join("\n");

/** Escape a JSON string so it can be safely embedded inside a <script> tag. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

/**
 * Hydration = pure string concat. Inline the data block + loader before
 * </body>. No server-side DOM work — the template is trusted after approval.
 */
export function hydrate(template: string, data: unknown): string {
  const block =
    `\n<script type="application/json" id="ei2-data">${safeJson(data)}</script>\n` +
    `<script>${LOADER_SCRIPT}</script>\n`;
  if (template.includes("</body>")) {
    return template.replace("</body>", block + "</body>");
  }
  return template + block;
}
