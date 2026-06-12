"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { toast } from "sonner";
import type {
  EditMap,
  Field,
  FieldGroup,
  PersistedDoc,
  RawScriptField,
  ScriptExtraction,
} from "@/lib/types";
import { extractDom, mapScriptFields, type InlineScript } from "@/lib/extract";
import { applyEdits } from "@/lib/apply-edits";
import { scriptsHash as computeScriptsHash } from "@/lib/hash";
import { loadDoc, saveDoc, clearDoc } from "@/lib/storage";

export type ScriptStatus = "idle" | "loading" | "done" | "error" | "no-key";

interface DocState {
  loaded: boolean;
  fileName: string;
  originalHtml: string;
  domFields: Field[];
  domGroups: FieldGroup[];
  scripts: InlineScript[];
  scriptsHash: string | null;
  scriptFields: Field[];
  scriptGroups: FieldGroup[];
  scriptStatus: ScriptStatus;
  scriptError?: string;
  scriptDropped: number;
  truncated: boolean;
  edits: EditMap;
}

const EMPTY: DocState = {
  loaded: false,
  fileName: "",
  originalHtml: "",
  domFields: [],
  domGroups: [],
  scripts: [],
  scriptsHash: null,
  scriptFields: [],
  scriptGroups: [],
  scriptStatus: "idle",
  scriptDropped: 0,
  truncated: false,
  edits: {},
};

type Action =
  | {
      type: "LOAD";
      fileName: string;
      originalHtml: string;
      domFields: Field[];
      domGroups: FieldGroup[];
      scripts: InlineScript[];
      truncated: boolean;
      edits: EditMap;
      cached?: ScriptExtraction;
    }
  | { type: "SET_EDIT"; id: string; value: string }
  | { type: "RESET_FIELD"; id: string }
  | { type: "RESET_ALL" }
  | { type: "SCRIPT_LOADING" }
  | {
      type: "SCRIPT_DONE";
      fields: Field[];
      groups: FieldGroup[];
      scriptsHash: string;
      dropped: number;
    }
  | { type: "SCRIPT_STATUS"; status: ScriptStatus; error?: string }
  | { type: "CLEAR" };

function reducer(state: DocState, action: Action): DocState {
  switch (action.type) {
    case "LOAD": {
      const base: DocState = {
        ...EMPTY,
        loaded: true,
        fileName: action.fileName,
        originalHtml: action.originalHtml,
        domFields: action.domFields,
        domGroups: action.domGroups,
        scripts: action.scripts,
        truncated: action.truncated,
        edits: action.edits,
      };
      if (action.cached) {
        return {
          ...base,
          scriptsHash: action.cached.scriptsHash,
          scriptFields: action.cached.fields,
          scriptGroups: action.cached.groups,
          scriptStatus: "done",
        };
      }
      return base;
    }
    case "SET_EDIT":
      return { ...state, edits: { ...state.edits, [action.id]: action.value } };
    case "RESET_FIELD": {
      const next = { ...state.edits };
      delete next[action.id];
      return { ...state, edits: next };
    }
    case "RESET_ALL":
      return { ...state, edits: {} };
    case "SCRIPT_LOADING":
      return { ...state, scriptStatus: "loading", scriptError: undefined };
    case "SCRIPT_DONE":
      return {
        ...state,
        scriptFields: action.fields,
        scriptGroups: action.groups,
        scriptsHash: action.scriptsHash,
        scriptDropped: action.dropped,
        scriptStatus: "done",
      };
    case "SCRIPT_STATUS":
      return { ...state, scriptStatus: action.status, scriptError: action.error };
    case "CLEAR":
      return EMPTY;
    default:
      return state;
  }
}

export interface UseDocument {
  state: DocState;
  allFields: Field[];
  allGroups: FieldGroup[];
  fieldById: Map<string, Field>;
  updatedHtml: string;
  hasEdits: boolean;
  hasExternalScripts: boolean;
  loadFile: (file: File) => Promise<void>;
  loadHtml: (fileName: string, html: string) => Promise<void>;
  restorePrevious: () => Promise<void>;
  setEdit: (id: string, value: string) => void;
  resetField: (id: string) => void;
  resetAll: () => void;
  reExtractScripts: () => void;
  clear: () => void;
}

async function runExtraction(
  dispatch: React.Dispatch<Action>,
  html: string,
  scripts: InlineScript[]
) {
  if (scripts.length === 0) {
    dispatch({ type: "SCRIPT_STATUS", status: "done" });
    return;
  }
  dispatch({ type: "SCRIPT_LOADING" });
  try {
    const res = await fetch("/api/extract-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scripts: scripts.map((s) => ({ index: s.index, content: s.content })),
      }),
    });
    if (res.status === 503) {
      dispatch({ type: "SCRIPT_STATUS", status: "no-key" });
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      dispatch({ type: "SCRIPT_STATUS", status: "error", error: j.message });
      return;
    }
    const j = (await res.json()) as { fields: RawScriptField[] };
    const mapped = mapScriptFields(html, scripts, j.fields ?? []);
    const hash = await computeScriptsHash(scripts);
    dispatch({
      type: "SCRIPT_DONE",
      fields: mapped.fields,
      groups: mapped.groups,
      scriptsHash: hash,
      dropped: mapped.dropped,
    });
    if (mapped.dropped > 0) {
      toast.warning(
        `${mapped.dropped} chart value${mapped.dropped === 1 ? "" : "s"} couldn't be located and were skipped.`
      );
    }
  } catch (e) {
    dispatch({
      type: "SCRIPT_STATUS",
      status: "error",
      error: e instanceof Error ? e.message : "Network error",
    });
  }
}

export function useDocument(): UseDocument {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaWarned = useRef(false);

  const loadHtml = useCallback(async (fileName: string, html: string) => {
    const dom = extractDom(html);
    // Check for a cached extraction matching this exact document.
    let cached: ScriptExtraction | undefined;
    let edits: EditMap = {};
    const persisted = loadDoc();
    if (persisted && persisted.originalHtml === html) {
      edits = persisted.edits ?? {};
      if (persisted.scriptExtraction) {
        const hash = await computeScriptsHash(dom.scripts);
        if (persisted.scriptExtraction.scriptsHash === hash) {
          cached = persisted.scriptExtraction;
        }
      }
    }

    dispatch({
      type: "LOAD",
      fileName,
      originalHtml: html,
      domFields: dom.fields,
      domGroups: dom.groups,
      scripts: dom.scripts,
      truncated: dom.truncated,
      edits,
      cached,
    });
    if (dom.truncated) {
      toast.warning("This file is very large; only the first 2,000 fields are shown.");
    }
    if (!cached) {
      void runExtraction(dispatch, html, dom.scripts);
    }
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      await loadHtml(file.name, text);
    },
    [loadHtml]
  );

  const restorePrevious = useCallback(async () => {
    const persisted = loadDoc();
    if (!persisted) return;
    await loadHtml(persisted.fileName, persisted.originalHtml);
  }, [loadHtml]);

  const reExtractScripts = useCallback(() => {
    if (state.scripts.length === 0) return;
    void runExtraction(dispatch, state.originalHtml, state.scripts);
  }, [state.scripts, state.originalHtml]);

  const setEdit = useCallback((id: string, value: string) => {
    dispatch({ type: "SET_EDIT", id, value });
  }, []);
  const resetField = useCallback((id: string) => {
    dispatch({ type: "RESET_FIELD", id });
  }, []);
  const resetAll = useCallback(() => dispatch({ type: "RESET_ALL" }), []);
  const clear = useCallback(() => {
    clearDoc();
    dispatch({ type: "CLEAR" });
  }, []);

  const allFields = useMemo(
    () => [...state.domFields, ...state.scriptFields],
    [state.domFields, state.scriptFields]
  );
  const allGroups = useMemo(
    () => [...state.domGroups, ...state.scriptGroups],
    [state.domGroups, state.scriptGroups]
  );
  const fieldById = useMemo(() => {
    const m = new Map<string, Field>();
    for (const f of allFields) m.set(f.id, f);
    return m;
  }, [allFields]);

  const updatedHtml = useMemo(
    () => applyEdits(state.originalHtml, allFields, state.edits),
    [state.originalHtml, allFields, state.edits]
  );

  const hasEdits = useMemo(() => {
    return Object.entries(state.edits).some(([id, v]) => {
      const f = fieldById.get(id);
      return f && v !== f.original;
    });
  }, [state.edits, fieldById]);

  const hasExternalScripts = useMemo(
    () => /<script[^>]+\bsrc=/i.test(state.originalHtml),
    [state.originalHtml]
  );

  // Debounced persistence.
  useEffect(() => {
    if (!state.loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const scriptExtraction: ScriptExtraction | undefined =
        state.scriptStatus === "done" && state.scriptsHash
          ? {
              scriptsHash: state.scriptsHash,
              fields: state.scriptFields,
              groups: state.scriptGroups,
            }
          : undefined;
      const doc: PersistedDoc = {
        v: 1,
        fileName: state.fileName,
        originalHtml: state.originalHtml,
        edits: state.edits,
        scriptExtraction,
        savedAt: Date.now(),
      };
      const result = saveDoc(doc);
      if (!result.ok && result.quota && !quotaWarned.current) {
        quotaWarned.current = true;
        toast.error("File too large to auto-save; your edits won't survive a refresh. Use Download to keep them.");
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    state.loaded,
    state.fileName,
    state.originalHtml,
    state.edits,
    state.scriptStatus,
    state.scriptsHash,
    state.scriptFields,
    state.scriptGroups,
  ]);

  return {
    state,
    allFields,
    allGroups,
    fieldById,
    updatedHtml,
    hasEdits,
    hasExternalScripts,
    loadFile,
    loadHtml,
    restorePrevious,
    setEdit,
    resetField,
    resetAll,
    reExtractScripts,
    clear,
  };
}
