import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { getDeepseek, CHAT_MODEL, CHAT_MAX_TOKENS, hasDeepseekKey, withBackoff } from "@/lib/deepseek";
import { buildChatSystem, parseChatReply } from "@/lib/chat-prompt";
import { runSanityChecks } from "@/lib/sanity";
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

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildChatSystem(record.originalHtml, record.template) },
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
    const { reply, proposedTemplate } = parseChatReply(content);
    return NextResponse.json({ reply, proposedTemplate });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat failed.";
    return NextResponse.json({ error: "chat_failed", message }, { status: 502 });
  }
}

interface ApplyBody {
  template: string;
}

/** PUT: apply a proposed template fix — sanity-check against current data, save. */
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
  const template = typeof body.template === "string" ? body.template : "";
  if (!template.trim()) {
    return NextResponse.json({ error: "bad_request", message: "Missing template." }, { status: 400 });
  }

  // Re-validate the fixed template against the existing data — the chat must
  // not have dropped markers, orphaned keys, or rewritten the whole document.
  const check = runSanityChecks(record.originalHtml, template, JSON.stringify(record.data));
  if (check.issues.length) {
    return NextResponse.json(
      { error: "apply_failed", message: "Proposed fix failed sanity checks.", issues: check.issues },
      { status: 422 }
    );
  }

  await saveTemplateAndData(id, template, record.data);
  return NextResponse.json({
    hydrated: hydrate(template, record.data),
    template,
  });
}
