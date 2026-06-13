import { z } from "zod";

/**
 * data.json — the sheet-style storage format. One top-level collection maps to
 * one editor tab. Sheets ARE the storage; the template is design-only and
 * binds to these by key.
 */

/** A cell may be a number (raw, re-formatted at display) or a display string. */
export const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Flat scalar with a display format. */
export const KpiSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  /** currency:MYR:2 | percent:1 | number:0 | text */
  format: z.string().default("text"),
});

/** Charts and tables share the same column/row sheet shape. */
export const SheetSchema = z.object({
  label: z.string().default(""),
  columns: z.array(z.string()),
  rows: z.array(z.array(Cell)),
});

export const NarrativeSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  text: z.string(),
  /** UI hint only: kpi keys whose values appear inside the prose. */
  mentions: z.array(z.string()).default([]),
});

export const LabelSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  label: z.string().optional(),
});

export const DataSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string().default(""),
    sourceFile: z.string().optional(),
  }),
  kpis: z.array(KpiSchema).default([]),
  charts: z.record(z.string(), SheetSchema).default({}),
  tables: z.record(z.string(), SheetSchema).default({}),
  narrative: z.array(NarrativeSchema).default([]),
  labels: z.array(LabelSchema).default([]),
});

export type Kpi = z.infer<typeof KpiSchema>;
export type Sheet = z.infer<typeof SheetSchema>;
export type Narrative = z.infer<typeof NarrativeSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type DashboardData = z.infer<typeof DataSchema>;

/** Parse + validate a raw JSON string against the schema. */
export function parseData(
  raw: string
): { ok: true; data: DashboardData } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `data is not valid JSON: ${(e as Error).message}` };
  }
  const result = DataSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `data failed schema validation: ${first}` };
  }
  return { ok: true, data: result.data };
}
