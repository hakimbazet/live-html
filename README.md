# Live HTML

Turn a static, AI-generated HTML dashboard into a **live, editable** one. Upload a
single self-contained HTML artifact (the kind Claude and other AI tools produce —
inline CSS/JS, Chart.js charts, KPI cards, tables) and the app extracts every piece
of data into an intuitive, grouped table. Edit a value and the rendered dashboard
updates instantly in a side-by-side preview. Download the updated HTML when you're done.

## How it works

- **Deterministic DOM extraction** — every visible text node, plus `img src` / `img alt`
  and `a href` attributes, is extracted client-side with [`parse5`](https://github.com/inikulin/parse5)
  using source-location info. Each field is addressed by its exact byte offset in the
  original HTML, so edits are applied by precise string splicing — the exported file is
  byte-identical to the original everywhere you didn't edit.
- **LLM chart-data extraction** — data inside inline `<script>` tags (Chart.js datasets,
  labels, titles) is too unstructured for a parser, so it's read by Claude. The model
  returns each editable value plus a unique anchor snippet; the client maps those back to
  verified byte offsets and drops anything it can't locate exactly. Results are cached by
  script-content hash, so a refresh never re-calls the API.
- **Live preview** — a sandboxed `<iframe srcDoc>` re-renders (and re-runs Chart.js) on a
  short debounce after each edit.
- **Persistence** — your document and edits auto-save to `localStorage`; "Download HTML"
  exports the edited file.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY for chart-data editing
pnpm dev
```

Open http://localhost:3000 and drop an HTML dashboard onto the page. A sample lives at
`fixtures/sample-dashboard.html`.

> The `ANTHROPIC_API_KEY` is **optional**. Without it, all text, image, and link editing
> works as normal — only the "Chart Data" tab (which reads values out of inline scripts)
> is disabled, with an explanatory message.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm lint` | Lint |

## Stack

Next.js (App Router) · Tailwind CSS v4 · shadcn/ui · parse5 · `@anthropic-ai/sdk`
