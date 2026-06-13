"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ImagePlus, Send, Loader2, Wand2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import type { DashboardData } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatFocus = "ui" | "editor";

export interface ChatApplyResult {
  hydrated: string;
  template: string;
  data: DashboardData;
}

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  images?: string[];
  proposedTemplate?: string;
  proposedData?: string;
  applied?: boolean;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const COPY = {
  ui: {
    title: "Fix assistant",
    Icon: Wand2,
    placeholder: "Describe the visual difference to fix…",
    empty:
      "Ask about visual differences between the original and the migrated dashboard, and attach a screenshot to point them out. I only discuss and fix these two documents.",
    successToast: "Fix applied — preview updated.",
  },
  editor: {
    title: "Dashboard assistant",
    Icon: Sparkles,
    placeholder: "Ask to change data, styling, or interactivity…",
    empty:
      "Ask me to change this dashboard's data (values, formats, labels, rows) or its appearance and interactivity (charts, tooltips, hover, layout, responsiveness). I edit the data and the generated HTML while keeping the bindings intact.",
    successToast: "Changes applied — preview updated.",
  },
} as const;

/** Reflect which artifact(s) a proposed change touches. */
function applyLabel(m: { applied?: boolean; proposedTemplate?: string; proposedData?: string }): string {
  if (m.applied) return "Applied";
  const parts: string[] = [];
  if (m.proposedTemplate) parts.push("UI");
  if (m.proposedData) parts.push("data");
  return parts.length ? `Apply ${parts.join(" + ")}` : "Apply";
}

export function DashboardChat({
  id,
  focus,
  onApplied,
  getData,
}: {
  id: string;
  focus: ChatFocus;
  onApplied: (result: ChatApplyResult) => void;
  /** Supplies the caller's current (possibly unsaved) data for context. */
  getData?: () => DashboardData | null;
}) {
  const copy = COPY[focus];
  const allowImages = true; // both focuses can use screenshots to point things out
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sending, setSending] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open, sending]);

  const addImages = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files can be attached.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("Image is larger than 4 MB.");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () =>
        setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, String(reader.result)]));
      reader.readAsDataURL(file);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && images.length === 0) || sending) return;

    const userMsg: ChatMsg = { role: "user", text, images: images.length ? images : undefined };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setImages([]);
    setSending(true);
    try {
      const res = await fetch(`/api/dashboards/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focus,
          data: getData?.() ?? undefined,
          messages: next.map((m) => ({ role: m.role, text: m.text, images: m.images })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Chat failed.");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: json.reply ?? "",
          proposedTemplate: json.proposedTemplate,
          proposedData: json.proposedData,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: e instanceof Error ? e.message : "Chat failed." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const applyFix = async (idx: number) => {
    const msg = messages[idx];
    if (!msg.proposedTemplate && !msg.proposedData) return;
    setApplyingIdx(idx);
    try {
      const res = await fetch(`/api/dashboards/${id}/chat`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: msg.proposedTemplate, data: msg.proposedData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.issues?.join("; ") ?? json.message ?? "Apply failed.");
      onApplied(json as ChatApplyResult);
      setMessages((m) => m.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
      toast.success(copy.successToast);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplyingIdx(null);
    }
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 size-12 rounded-full shadow-lg"
        size="icon"
        aria-label={`Open ${copy.title}`}
      >
        <MessageCircle className="size-5" />
      </Button>
    );
  }

  return (
    <div className="bg-background fixed bottom-5 right-5 z-40 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-xl border shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <copy.Icon className="text-primary size-4" />
          <span className="text-sm font-semibold">{copy.title}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-xs">
            {copy.empty} When I propose a change, you&apos;ll get an{" "}
            <span className="font-medium">Apply</span> button.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {m.text}
            </div>
            {m.images && m.images.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1">
                {m.images.map((src, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} src={src} alt="attachment" className="size-16 rounded border object-cover" />
                ))}
              </div>
            )}
            {m.role === "assistant" && (m.proposedTemplate || m.proposedData) && (
              <Button
                size="sm"
                variant={m.applied ? "secondary" : "default"}
                disabled={m.applied || applyingIdx === i}
                onClick={() => applyFix(i)}
              >
                {applyingIdx === i ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : m.applied ? (
                  <Check className="size-4" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                {applyLabel(m)}
              </Button>
            )}
          </div>
        ))}
        {sending && (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {allowImages && images.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t px-3 py-2">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="pending attachment" className="size-12 rounded border object-cover" />
              <button
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                className="bg-background absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t p-2">
        {allowImages && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              disabled={images.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
              aria-label="Attach screenshot"
            >
              <ImagePlus className="size-4" />
            </Button>
          </>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={copy.placeholder}
          className="max-h-28 min-h-9 resize-none py-2"
        />
        <Button
          size="icon"
          className="size-9 shrink-0"
          disabled={sending || (!input.trim() && images.length === 0)}
          onClick={send}
          aria-label="Send"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
