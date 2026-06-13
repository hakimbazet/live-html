import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DataSchema, type DashboardData } from "./schema";

/**
 * Plain-filesystem persistence for the PoC. Each dashboard is a folder under
 * data/{id}/ holding original.html, template.html, data.json and meta.json.
 * Swappable for DB columns later — this is the only file that touches storage.
 */

const DATA_DIR = path.join(process.cwd(), "data");

export type DashboardStatus = "pending" | "approved" | "rejected";

export interface DashboardMeta {
  id: string;
  title: string;
  sourceFile: string;
  status: DashboardStatus;
  createdAt: number;
  updatedAt: number;
  /** Recorded migration cost in USD, when the provider reports usage. */
  costUsd?: number;
}

export interface DashboardRecord {
  meta: DashboardMeta;
  originalHtml: string;
  template: string;
  data: DashboardData;
}

export function newId(): string {
  return randomUUID().slice(0, 8);
}

function dir(id: string): string {
  return path.join(DATA_DIR, id);
}

export interface SaveInput {
  originalHtml: string;
  template: string;
  data: DashboardData;
  sourceFile: string;
  costUsd?: number;
}

export async function saveDashboard(id: string, input: SaveInput): Promise<DashboardRecord> {
  const d = dir(id);
  await fs.mkdir(d, { recursive: true });
  const now = Date.now();
  const meta: DashboardMeta = {
    id,
    title: input.data.meta.title || input.sourceFile,
    sourceFile: input.sourceFile,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    costUsd: input.costUsd,
  };
  await Promise.all([
    fs.writeFile(path.join(d, "original.html"), input.originalHtml, "utf8"),
    fs.writeFile(path.join(d, "template.html"), input.template, "utf8"),
    fs.writeFile(path.join(d, "data.json"), JSON.stringify(input.data, null, 2), "utf8"),
    fs.writeFile(path.join(d, "meta.json"), JSON.stringify(meta, null, 2), "utf8"),
  ]);
  return { meta, originalHtml: input.originalHtml, template: input.template, data: input.data };
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function loadDashboard(id: string): Promise<DashboardRecord | null> {
  const d = dir(id);
  const [originalHtml, template, dataRaw, metaRaw] = await Promise.all([
    readIfExists(path.join(d, "original.html")),
    readIfExists(path.join(d, "template.html")),
    readIfExists(path.join(d, "data.json")),
    readIfExists(path.join(d, "meta.json")),
  ]);
  if (originalHtml === null || template === null || dataRaw === null || metaRaw === null) {
    return null;
  }
  const data = DataSchema.parse(JSON.parse(dataRaw));
  const meta = JSON.parse(metaRaw) as DashboardMeta;
  return { meta, originalHtml, template, data };
}

/** Persist edited data.json (editor save). Validates before writing. */
export async function saveData(id: string, data: DashboardData): Promise<void> {
  const d = dir(id);
  const validated = DataSchema.parse(data);
  await fs.writeFile(path.join(d, "data.json"), JSON.stringify(validated, null, 2), "utf8");
  await touchMeta(id, {});
}

export async function setStatus(id: string, status: DashboardStatus): Promise<void> {
  await touchMeta(id, { status });
}

/** Persist a rewired template + data together (e.g. after JSON optimization). */
export async function saveTemplateAndData(
  id: string,
  template: string,
  data: DashboardData
): Promise<void> {
  const d = dir(id);
  const validated = DataSchema.parse(data);
  await Promise.all([
    fs.writeFile(path.join(d, "template.html"), template, "utf8"),
    fs.writeFile(path.join(d, "data.json"), JSON.stringify(validated, null, 2), "utf8"),
  ]);
  await touchMeta(id, {});
}

async function touchMeta(id: string, patch: Partial<DashboardMeta>): Promise<void> {
  const p = path.join(dir(id), "meta.json");
  const raw = await readIfExists(p);
  if (!raw) return;
  const meta = { ...(JSON.parse(raw) as DashboardMeta), ...patch, updatedAt: Date.now() };
  await fs.writeFile(p, JSON.stringify(meta, null, 2), "utf8");
}

export async function listDashboards(): Promise<DashboardMeta[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const metas: DashboardMeta[] = [];
  for (const id of ids) {
    const raw = await readIfExists(path.join(DATA_DIR, id, "meta.json"));
    if (raw) metas.push(JSON.parse(raw) as DashboardMeta);
  }
  return metas.sort((a, b) => b.createdAt - a.createdAt);
}
