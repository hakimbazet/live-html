import { NextResponse } from "next/server";
import { getDeepseek, MODEL, MAX_TOKENS, hasDeepseekKey, withBackoff } from "@/lib/deepseek";
import { MIGRATE_SYSTEM, parseSentinels, repairMessage } from "@/lib/migrate-prompt";
import { runSanityChecks } from "@/lib/sanity";
import { newId, saveDashboard } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

interface MigrateRequest {
  html: string;
  fileName?: string;
}

// DeepSeek reasoner/v3 pricing (USD per 1M tokens), used only to record a
// rough per-dashboard cost. Override if the deployment uses different rates.
const COST_IN = Number(process.env.DEEPSEEK_COST_IN_PER_M ?? 0.27) / 1_000_000;
const COST_OUT = Number(process.env.DEEPSEEK_COST_OUT_PER_M ?? 1.1) / 1_000_000;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callMigrate(messages: ChatMessage[]) {
  return withBackoff(() =>
    getDeepseek().chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      messages,
    })
  );
}

export async function POST(req: Request) {
  if (!hasDeepseekKey()) {
    return NextResponse.json(
      { error: "no_api_key", message: "DEEPSEEK_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: MigrateRequest;
  try {
    body = (await req.json()) as MigrateRequest;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const originalHtml = typeof body.html === "string" ? body.html : "";
  const fileName = body.fileName?.trim() || "dashboard.html";
  if (!originalHtml.trim()) {
    return NextResponse.json(
      { error: "bad_request", message: "Missing HTML." },
      { status: 400 }
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: MIGRATE_SYSTEM },
    { role: "user", content: originalHtml },
  ];

  let costUsd = 0;
  try {
    // ---- First attempt ----
    let res = await callMigrate(messages);
    costUsd += estimateCost(res.usage);

    if (res.choices[0]?.finish_reason === "length") {
      return NextResponse.json(
        {
          error: "truncated",
          message:
            "Output truncated — raise DEEPSEEK_MAX_TOKENS or split the dashboard.",
          issues: ["Output truncated (finish_reason=length)."],
        },
        { status: 422 }
      );
    }

    let { template, data } = parseSentinels(res.choices[0]?.message?.content ?? "");
    let check = runSanityChecks(originalHtml, template, data, res.choices[0]?.finish_reason);

    // ---- One repair attempt ----
    if (check.issues.length) {
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: res.choices[0]?.message?.content ?? "" },
        { role: "user", content: repairMessage(check.issues) },
      ];
      res = await callMigrate(repairMessages);
      costUsd += estimateCost(res.usage);

      if (res.choices[0]?.finish_reason === "length") {
        return NextResponse.json(
          {
            error: "truncated",
            message: "Repair output truncated — raise DEEPSEEK_MAX_TOKENS.",
            issues: check.issues,
          },
          { status: 422 }
        );
      }
      ({ template, data } = parseSentinels(res.choices[0]?.message?.content ?? ""));
      check = runSanityChecks(originalHtml, template, data, res.choices[0]?.finish_reason);
    }

    if (check.issues.length || !check.data) {
      // Still failing — surface to the UI, write nothing to data/.
      return NextResponse.json(
        {
          error: "sanity_failed",
          message: "Migration failed deterministic checks after one repair attempt.",
          issues: check.issues,
        },
        { status: 422 }
      );
    }

    const id = newId();
    await saveDashboard(id, {
      originalHtml,
      template,
      data: check.data,
      sourceFile: fileName,
      costUsd: Number(costUsd.toFixed(6)),
    });

    return NextResponse.json({ id, costUsd: Number(costUsd.toFixed(6)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Migration failed.";
    return NextResponse.json({ error: "migration_failed", message }, { status: 502 });
  }
}

function estimateCost(usage: { prompt_tokens?: number; completion_tokens?: number } | undefined): number {
  if (!usage) return 0;
  return (usage.prompt_tokens ?? 0) * COST_IN + (usage.completion_tokens ?? 0) * COST_OUT;
}
