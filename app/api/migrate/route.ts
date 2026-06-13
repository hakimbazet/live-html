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
type Usage = { prompt_tokens?: number; completion_tokens?: number } | undefined;

/**
 * Progress events streamed to the client as newline-delimited JSON. The long
 * pole is the LLM generation, so we surface phase changes plus a live count of
 * characters received as the model streams its (large) template + JSON output.
 */
type Event =
  | { type: "status"; message: string }
  | { type: "progress"; phase: string; chars: number }
  | { type: "done"; id: string; costUsd: number }
  | { type: "error"; message: string; issues?: string[] };

/** One streaming completion. Calls `onDelta` as tokens arrive. */
async function streamAttempt(
  messages: ChatMessage[],
  onDelta: (chars: number) => void
): Promise<{ content: string; finishReason: string | null | undefined; usage: Usage }> {
  const stream = await withBackoff(() =>
    getDeepseek().chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    })
  );

  let content = "";
  let finishReason: string | null | undefined;
  let usage: Usage;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      content += delta;
      onDelta(content.length);
    }
    if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return { content, finishReason, usage };
}

function estimateCost(usage: Usage): number {
  if (!usage) return 0;
  return (usage.prompt_tokens ?? 0) * COST_IN + (usage.completion_tokens ?? 0) * COST_OUT;
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
    return NextResponse.json({ error: "bad_request", message: "Missing HTML." }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: MIGRATE_SYSTEM },
    { role: "user", content: originalHtml },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      // Throttle the per-token progress so we emit at most ~7 events/sec.
      const throttledProgress = (phase: string) => {
        let last = 0;
        return (chars: number) => {
          const now = Date.now();
          if (now - last > 140) {
            last = now;
            send({ type: "progress", phase, chars });
          }
        };
      };

      let costUsd = 0;
      try {
        // ---- First attempt ----
        send({ type: "status", message: "Calling DeepSeek…" });
        let res = await streamAttempt(messages, throttledProgress("generating"));
        send({ type: "progress", phase: "generating", chars: res.content.length });
        costUsd += estimateCost(res.usage);

        if (res.finishReason === "length") {
          send({
            type: "error",
            message: "Output truncated — raise DEEPSEEK_MAX_TOKENS or split the dashboard.",
            issues: ["Output truncated (finish_reason=length)."],
          });
          return controller.close();
        }

        send({ type: "status", message: "Parsing template + data…" });
        let { template, data } = parseSentinels(res.content);

        send({ type: "status", message: "Running sanity checks…" });
        let check = runSanityChecks(originalHtml, template, data, res.finishReason ?? undefined);

        // ---- One repair attempt ----
        if (check.issues.length) {
          send({
            type: "status",
            message: `Found ${check.issues.length} issue(s) — attempting one repair…`,
          });
          const repairMessages: ChatMessage[] = [
            ...messages,
            { role: "assistant", content: res.content },
            { role: "user", content: repairMessage(check.issues) },
          ];
          res = await streamAttempt(repairMessages, throttledProgress("repairing"));
          send({ type: "progress", phase: "repairing", chars: res.content.length });
          costUsd += estimateCost(res.usage);

          if (res.finishReason === "length") {
            send({
              type: "error",
              message: "Repair output truncated — raise DEEPSEEK_MAX_TOKENS.",
              issues: check.issues,
            });
            return controller.close();
          }

          send({ type: "status", message: "Re-running sanity checks…" });
          ({ template, data } = parseSentinels(res.content));
          check = runSanityChecks(originalHtml, template, data, res.finishReason ?? undefined);
        }

        if (check.issues.length || !check.data) {
          send({
            type: "error",
            message: "Migration failed deterministic checks after one repair attempt.",
            issues: check.issues,
          });
          return controller.close();
        }

        send({ type: "status", message: "Saving dashboard…" });
        const id = newId();
        await saveDashboard(id, {
          originalHtml,
          template,
          data: check.data,
          sourceFile: fileName,
          costUsd: Number(costUsd.toFixed(6)),
        });

        send({ type: "done", id, costUsd: Number(costUsd.toFixed(6)) });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Migration failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
