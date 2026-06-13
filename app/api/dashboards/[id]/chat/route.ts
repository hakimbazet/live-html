import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getDeepseek, CHAT_MODEL, CHAT_MAX_TOKENS, hasDeepseekKey, withBackoff } from "@/lib/deepseek";
import { buildChatSystem, parseChatReply, type ChatFocus } from "@/lib/chat-prompt";
import { runSanityChecks } from "@/lib/sanity";
import { DataSchema } from "@/lib/schema";
import { hydrate } from "@/lib/loader";
import { loadDashboard, saveTemplateAndData } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatTurn {
  role: "user" | "assistant";
  text?: string;
  images?: string[]; // data: URLs
}

interface ChatBody {
  messages: ChatTurn[];
  focus?: ChatFocus;
  /** Current (possibly unsaved) data for context, e.g. the editor's state. */
  data?: unknown;
}

/** POST: one chat turn scoped to the original vs. generated template. */
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

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const turns = Array.isArray(body.messages) ? body.messages : [];
  if (turns.length === 0) {
    return NextResponse.json({ error: "bad_request", message: "No messages." }, { status: 400 });
  }

  const focus: ChatFocus = body.focus === "data" ? "data" : "ui";
  // Use the caller's current (possibly unsaved) data for context if supplied.
  let contextData = record.data;
  if (body.data !== undefined) {
    const p = DataSchema.safeParse(body.data);
    if (p.success) contextData = p.data;
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildChatSystem(
        focus,
        record.originalHtml,
        record.template,
        JSON.stringify(contextData, null, 2)
      ),
    },
  ];
  for (const t of turns) {
    if (t.role === "assistant") {
      messages.push({ role: "assistant", content: t.text ?? "" });
      continue;
    }
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    if (t.text) parts.push({ type: "text", text: t.text });
    for (const url of t.images ?? []) {
      if (typeof url === "string" && url.startsWith("data:image/")) {
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
    messages.push({ role: "user", content: parts.length ? parts : (t.text ?? "") });
  }

  try {
    const res = await withBackoff(() =>
      getDeepseek().chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0,
        max_tokens: CHAT_MAX_TOKENS,
        messages,
      })
    );
    const content = res.choices[0]?.message?.content ?? "";
    const { reply, proposedTemplate, proposedData } = parseChatReply(content);
    return NextResponse.json({ reply, proposedTemplate, proposedData });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat failed.";
    return NextResponse.json({ error: "chat_failed", message }, { status: 502 });
  }
}

interface ApplyBody {
  template?: string;
  /** Optional corrected data.json (object or raw JSON string). */
  data?: unknown;
}

/**
 * PUT: apply a proposed fix. Template and/or data may change — whichever the
 * chat returned; the other falls back to the stored value. The resulting pair
 * is re-run through the full sanity suite (so template markers and data keys
 * must stay in sync) and persisted only if it passes.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadDashboard(id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const hasTemplate = typeof body.template === "string" && body.template.trim().length > 0;
  const hasData = body.data !== undefined && body.data !== null;
  if (!hasTemplate && !hasData) {
    return NextResponse.json(
      { error: "bad_request", message: "Nothing to apply." },
      { status: 400 }
    );
  }

  const template = hasTemplate ? (body.template as string) : record.template;

  let data = record.data;
  if (hasData) {
    let json: unknown = body.data;
    if (typeof json === "string") {
      try {
        json = JSON.parse(json);
      } catch {
        return NextResponse.json(
          { error: "invalid_data", issues: ["proposed data.json is not valid JSON"] },
          { status: 422 }
        );
      }
    }
    const parsed = DataSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_data", issues: parsed.error.issues.map((i) => i.message) },
        { status: 422 }
      );
    }
    data = parsed.data;
  }

  // Re-validate the resulting pair — the chat must not have dropped markers,
  // orphaned keys in either direction, or rewritten the whole document.
  const check = runSanityChecks(record.originalHtml, template, JSON.stringify(data));
  if (check.issues.length) {
    return NextResponse.json(
      { error: "apply_failed", message: "Proposed fix failed sanity checks.", issues: check.issues },
      { status: 422 }
    );
  }

  await saveTemplateAndData(id, template, data);
  return NextResponse.json({
    hydrated: hydrate(template, data),
    template,
    data,
  });
}
