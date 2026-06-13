import { NextResponse } from "next/server";
import { getDeepseek, MODEL, hasDeepseekKey, withBackoff } from "@/lib/deepseek";
import { DataSchema } from "@/lib/schema";
import { hydrate } from "@/lib/loader";
import {
  OPTIMIZE_SYSTEM,
  buildOptimizeUser,
  ProposalSchema,
  MergeGroupSchema,
  applyMerges,
  type MergeGroup,
} from "@/lib/optimize";
import { loadDashboard, saveTemplateAndData } from "@/lib/store";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST: ask the LLM to propose duplicate-key merge groups over the given data. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasDeepseekKey()) {
    return NextResponse.json(
      { error: "no_api_key", message: "DEEPSEEK_API_KEY is not configured." },
      { status: 503 }
    );
  }
  const record = await loadDashboard(id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Operate on the data the caller currently sees (editor state), if provided.
  const body = await req.json().catch(() => ({}));
  const dataParse = DataSchema.safeParse(body?.data);
  const data = dataParse.success ? dataParse.data : record.data;

  try {
    const res = await withBackoff(() =>
      getDeepseek().chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: OPTIMIZE_SYSTEM },
          { role: "user", content: buildOptimizeUser(data) },
        ],
      })
    );
    const content = res.choices[0]?.message?.content ?? "{}";
    const parsed = ProposalSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return NextResponse.json({ groups: [] });
    }
    // Annotate each group with the shared display value for the review dialog,
    // and drop any group that doesn't actually reduce duplication.
    const kpiVal = new Map(data.kpis.map((k) => [k.key, String(k.value)]));
    const labelVal = new Map(data.labels.map((l) => [l.key, l.value]));
    const groups = parsed.data.groups
      .filter((g) => g.duplicates.length > 0)
      .map((g) => ({
        ...g,
        value: g.type === "kpi" ? kpiVal.get(g.canonical) ?? "" : labelVal.get(g.canonical) ?? "",
      }));
    return NextResponse.json({ groups });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Optimization failed.";
    return NextResponse.json({ error: "optimize_failed", message }, { status: 502 });
  }
}

const ApplyBody = z.object({
  data: z.unknown().optional(),
  groups: z.array(MergeGroupSchema).min(1),
});

/** PUT: deterministically apply the reviewed merge groups, re-check, persist. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadDashboard(id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = ApplyBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const dataParse = DataSchema.safeParse(parsed.data.data);
  const data = dataParse.success ? dataParse.data : record.data;
  const groups: MergeGroup[] = parsed.data.groups;

  const result = applyMerges(record.originalHtml, record.template, data, groups);
  if (!result.ok) {
    return NextResponse.json(
      { error: "apply_failed", message: "Merge failed validation.", issues: result.issues },
      { status: 422 }
    );
  }

  await saveTemplateAndData(id, result.template, result.data);
  const updated = await loadDashboard(id);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    meta: updated.meta,
    template: updated.template,
    data: updated.data,
    hydrated: hydrate(updated.template, updated.data),
    removed: result.removed,
  });
}
