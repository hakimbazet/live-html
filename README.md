# Live HTML — Dashboards PoC

Turn a static, AI-generated HTML dashboard into a **live, editable** one. Upload a
single self-contained HTML artifact (the kind Claude and other AI tools produce —
inline CSS/JS, Chart.js charts, KPI cards, tables) and **one LLM migration call**
splits it into:

- a design-only **`template.html`** (every dynamic value replaced with a `data-bind`
  / `data-chart` / `data-table` marker; nothing else touched), and
- an editable **`data.json`** (sheet-style: KPIs, charts, tables, narrative, labels).

A deterministic ~60-line loader re-hydrates the template from the data at view time,
so the migrated dashboard is visually indistinguishable from the original — and a
spreadsheet-like editor lets you change a value and watch the preview update live.

## Flow

1. **Upload** (`/`) — drop an HTML dashboard. `POST /api/migrate` makes a single
   DeepSeek call, runs deterministic sanity checks, retries once with the issue list
   if needed, and (only on success) writes `data/{id}/`.
2. **Verify** (`/verify/[id]`) — original vs. hydrated template, side-by-side.
   **Approve** freezes the migration; **Reject** sends it back. A **fix assistant**
   chat bubble (multimodal — attach screenshots) is scoped strictly to these two
   documents: ask it about a visual difference and it proposes a corrected template
   you **Apply**, which is re-run through the sanity suite before saving (a fix that
   drops a marker or rewrites the document is rejected, never persisted). Its model
   is set by `DEEPSEEK_CHAT_MODEL` (default `deepseek-v4-flash`).
3. **Edit** (`/editor/[id]`) — tabs for KPIs · each chart · each table · Narrative ·
   Labels, with a live preview. Save writes `data.json` and re-hydrates.

Both the verify and editor screens expose **Download HTML** (the generated, standalone
hydrated file) and **Download JSON** (the `data.json` that produced it). The server
already keeps both — plus `original.html` and `meta.json` — under `data/{id}/`; the
buttons just save them (current editor state included) to your machine.

**Gallery** (`/gallery`) lists every saved dashboard with a live thumbnail, status,
date and migration cost, and links straight into verify or edit.

**Optimize** (editor) is an optional second LLM pass that finds keyed scalar values
(KPIs / labels) stored under different keys but representing the same fact, and
proposes merging them. The LLM only *suggests* groupings; merging is applied
**deterministically** (`lib/optimize.ts`) — it rewires every `data-bind` to the
canonical key, drops the duplicate entries, and re-runs the full sanity suite before
persisting. You review and tick the proposed merges before anything is applied, so a
wrong suggestion can't silently change two places at once.

## Why a migration call, not a parser

The model holds a strict "don't touch anything you don't have to" constraint and
deduplicates repeated values to a single keyed entry, so one edit updates every
location. Correctness is enforced **deterministically** after the fact
(`lib/sanity.ts`): JSON + schema validation, bidirectional key integrity (no orphan
markers or unbound data), a template byte-length band (catches accidental rewrites),
and `chart-styles` validation. A failed migration is never written to disk.

## LLM provider

DeepSeek (OpenAI-compatible) via the `openai` SDK — cheap, ideal for high-iteration
prototyping. Output length is the binding constraint: the call emits the full
template **and** JSON, so `finish_reason === "length"` is treated as a failed
migration, never parsed. Porting to Anthropic-via-Foundry later changes only
`lib/deepseek.ts` (constructor + message shape); the prompt is unchanged.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # add your DEEPSEEK_API_KEY
pnpm dev
```

Open http://localhost:3000 and drop an HTML dashboard. A sample lives at
`fixtures/sample-dashboard.html`.

> Without `DEEPSEEK_API_KEY`, the migration route returns `503` and the upload screen
> shows the error — the rest of the app (verify/editor over already-migrated
> dashboards) still works.

## Layout

| Path | Role |
| --- | --- |
| `lib/deepseek.ts` | Lazy OpenAI-SDK client + backoff (DeepSeek base URL) |
| `lib/schema.ts` | zod schema for `data.json` |
| `lib/migrate-prompt.ts` | System prompt + deterministic sentinel parsing |
| `lib/sanity.ts` | Post-migration deterministic checks |
| `lib/loader.ts` | Runtime hydration loader (raw string) + `hydrate()` |
| `lib/store.ts` | Filesystem persistence (`data/{id}/`) |
| `app/api/migrate/route.ts` | `POST` — one DeepSeek call + checks + one repair retry |
| `app/api/dashboards/[id]/route.ts` | `GET`/`PUT` — load / save data + status |
| `app/page.tsx` · `app/verify/[id]` · `app/editor/[id]` | Upload · approve · edit |

**Persistence is the plain filesystem** for the PoC: `data/{id}/` holds
`original.html`, `template.html`, `data.json`, `meta.json`. Swap for DB columns later
in one file (`lib/store.ts`); `data/` contents are git-ignored.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm lint` | Lint |

## Stack

Next.js (App Router) · Tailwind CSS v4 · shadcn/ui · `openai` (DeepSeek) · zod
