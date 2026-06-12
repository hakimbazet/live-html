import type { PersistedDoc } from "./types";

const KEY = "live-html:current";

export type SaveResult = { ok: true } | { ok: false; quota: boolean };

export function loadDoc(): PersistedDoc | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDoc;
    if (parsed && parsed.v === 1 && typeof parsed.originalHtml === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDoc(doc: PersistedDoc): SaveResult {
  if (typeof localStorage === "undefined") return { ok: false, quota: false };
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return { ok: true };
  } catch (e) {
    const quota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, quota };
  }
}

export function clearDoc(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
