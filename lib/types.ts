export type FieldKind = "text" | "attr" | "script-string" | "script-number";

export type AttrName = "src" | "href" | "alt";

export type QuoteChar = '"' | "'" | "`" | null;

export interface FieldMeta {
  /** Owner/parent tag for text & attr fields, e.g. "h1", "td", "img". */
  tag?: string;
  /** For attr fields. */
  attrName?: AttrName;
  /** Quote character wrapping an attr value or JS string literal. */
  quote?: QuoteChar;
  /** Index of the inline <script> a script field came from. */
  scriptIndex?: number;
  /** True when an attr value/img src is a long data: URI (render as textarea). */
  longValue?: boolean;
}

export interface Field {
  /** Deterministic, offset-derived: "t:<start>", "a:<name>:<start>", "s:<start>". */
  id: string;
  kind: FieldKind;
  /** Absolute offset of the replaceable span in originalHtml. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  /** Exact original source slice (entities/escapes intact) — must equal html.slice(start,end). */
  raw: string;
  /** Decoded, human-editable original value. */
  original: string;
  /** Inferred human-readable label, e.g. "Heading", "Revenue value", "data[3]". */
  label: string;
  /** Context trail shown in a tooltip, e.g. "Revenue card › h2". */
  breadcrumb: string;
  groupId: string;
  meta: FieldMeta;
}

export interface FieldGroup {
  id: string;
  label: string;
  kind: "section" | "chart" | "misc";
  /** Document order of the group's first member (sort key). */
  order: number;
  fieldIds: string[];
}

/** fieldId -> current value. Only present when the value differs from the field's original. */
export type EditMap = Record<string, string>;

/** Result of the LLM-driven inline-script extraction, cached by script-content hash. */
export interface ScriptExtraction {
  scriptsHash: string;
  fields: Field[];
  groups: FieldGroup[];
}

export interface ExtractResult {
  fields: Field[];
  groups: FieldGroup[];
}

export interface PersistedDoc {
  v: 1;
  fileName: string;
  originalHtml: string;
  edits: EditMap;
  scriptExtraction?: ScriptExtraction;
  savedAt: number;
}

/** Shape returned by the /api/extract-script route (one entry per editable script value). */
export interface RawScriptField {
  scriptIndex: number;
  label: string;
  group: string;
  valueType: "number" | "string";
  /** The exact literal as it appears in source, e.g. `150.5` or `Q1` (without quotes). */
  literal: string;
  /** A verbatim snippet from the script that uniquely contains the literal. */
  anchor: string;
}
