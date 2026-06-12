export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Cheap sanity check that an uploaded file looks like editable HTML. */
export function validateHtml(fileName: string, text: string): ValidationResult {
  if (text.length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (text.length > MAX_FILE_BYTES) {
    return { ok: false, error: "File is larger than 10 MB." };
  }
  const looksLikeHtml = /<[a-z!/]/i.test(text);
  if (!looksLikeHtml) {
    return { ok: false, error: "This doesn't look like an HTML file." };
  }
  // DOMParser smoke test (browser only).
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    if (!doc.body || (doc.body.childNodes.length === 0 && !/<body/i.test(text))) {
      // Still allow — fragments without <body> are fine — but reject pure
      // parser-error documents with no usable content.
      if (doc.querySelector("parsererror") && !doc.body.textContent?.trim()) {
        return { ok: false, error: "The file could not be parsed as HTML." };
      }
    }
  }
  void fileName;
  return { ok: true };
}
