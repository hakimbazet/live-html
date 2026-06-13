import { NextResponse } from "next/server";
import { DataSchema } from "@/lib/schema";
import { hydrate } from "@/lib/loader";
import { loadDashboard, saveData, setStatus } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = await loadDashboard(id);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    meta: record.meta,
    originalHtml: record.originalHtml,
    template: record.template,
    data: record.data,
    hydrated: hydrate(record.template, record.data),
  });
}

interface PutBody {
  data?: unknown;
  status?: "approved" | "rejected" | "pending";
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = await loadDashboard(id);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.data !== undefined) {
    const parsed = DataSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_data", issues: parsed.error.issues.map((i) => i.message) },
        { status: 422 }
      );
    }
    await saveData(id, parsed.data);
  }

  if (body.status) {
    await setStatus(id, body.status);
  }

  const updated = await loadDashboard(id);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    meta: updated.meta,
    data: updated.data,
    hydrated: hydrate(updated.template, updated.data),
  });
}
