"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ImagePlus, Send, Loader2, Wand2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

export function VerifyChat({
  id,
  onApplied,
}: {
  id: string;
  onApplied: (hydrated: string) => void;
}) {
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
        setImages((prev) =>
          prev.length >= MAX_IMAGES ? prev : [...prev, String(reader.result)]
        );
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
      onApplied(json.hydrated);
      setMessages((m) => m.map((x, i) => (i === idx ? { ...x, applied: true } : x)));
      toast.success("Fix applied — preview updated.");
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
        aria-label="Open fix assistant"
      >
        <MessageCircle className="size-5" />
      </Button>
    );
  }

  return (
    <div className="bg-background fixed bottom-5 right-5 z-40 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-xl border shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Wand2 className="text-primary size-4" />
          <span className="text-sm font-semibold">Fix assistant</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-xs">
            Ask about visual differences between the original and the migrated dashboard,
            and attach a screenshot to point them out. I can only discuss and fix these two
            documents. When I propose a fix, you&apos;ll get an{" "}
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
                  <img
                    key={j}
                    src={src}
                    alt="attachment"
                    className="size-16 rounded border object-cover"
                  />
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
                {m.applied
                  ? "Applied"
                  : m.proposedData
                    ? "Apply fix (updates data)"
                    : "Apply fix"}
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

      {images.length > 0 && (
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
          placeholder="Describe the difference to fix…"
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
