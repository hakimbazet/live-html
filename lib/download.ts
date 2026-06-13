/** Browser-only helpers for saving generated artifacts to the user's machine. */

/** Trigger a client-side download of an in-memory text artifact. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Turn a title/filename into a safe download basename (no extension). */
export function slugify(value: string, fallback = "dashboard"): string {
  const out = value
    .toLowerCase()
    .replace(/\.html?$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || fallback;
}
