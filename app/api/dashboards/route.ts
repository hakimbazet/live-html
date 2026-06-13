import { NextResponse } from "next/server";
import { listDashboards } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dashboards = await listDashboards();
  return NextResponse.json({ dashboards });
}
