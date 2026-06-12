import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { RawScriptField } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SCRIPT_CHARS = 50_000;

interface ExtractRequest {
  scripts: { index: number; content: string }[];
}

const SYSTEM_PROMPT = `You extract user-editable data values from inline JavaScript found in AI-generated HTML dashboards (e.g. Chart.js configs).

For each script, find every literal value a non-technical user might want to update to change what the dashboard shows:
- chart data arrays (e.g. data: [120, 135, 150])
- chart category/labels arrays (e.g. labels: ['Q1','Q2'])
- dataset names (label: 'Revenue 2024')
- chart/axis titles (text: 'Quarterly Revenue')
- any other plain string or number data literals that represent displayed content

Do NOT extract: function names, variable identifiers, option keys, booleans, colors/hex codes, CSS, element ids/selectors, URLs, or structural code.

For EACH editable value return an object:
- scriptIndex: the index of the script it came from
- label: a short human-readable label. Prefix array items with the nearest dataset name and index, e.g. "Revenue 2024 › data[3]" or "labels[0]". Use "Chart title" for titles.
- group: a human-readable group name for the chart/section, e.g. "Chart: Quarterly Revenue". Reuse the same string for all values of one chart.
- valueType: "number" or "string"
- literal: the value EXACTLY as it appears in the source, WITHOUT surrounding quotes. Copy it byte-for-byte (keep decimals, signs, and any escape sequences). For 150.5 return "150.5"; for 'Q1' return "Q1".
- anchor: a SHORT verbatim snippet copied from the script (roughly 12-40 chars) that contains this exact literal and is UNIQUE within that script. Include enough surrounding characters (brackets, commas, neighbouring values, the key name) that the snippet appears only once. The literal must appear inside the anchor.

Return only real editable values. If a script has none, return no entries for it.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          scriptIndex: { type: "integer" },
          label: { type: "string" },
          group: { type: "string" },
          valueType: { type: "string", enum: ["number", "string"] },
          literal: { type: "string" },
          anchor: { type: "string" },
        },
        required: ["scriptIndex", "label", "group", "valueType", "literal", "anchor"],
      },
    },
  },
  required: ["fields"],
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "no_api_key", message: "ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const scripts = (body.scripts ?? [])
    .filter((s) => typeof s.content === "string" && s.content.trim().length > 0)
    .map((s) => ({ index: s.index, content: s.content.slice(0, MAX_SCRIPT_CHARS) }));

  if (scripts.length === 0) {
    return NextResponse.json({ fields: [] satisfies RawScriptField[] });
  }

  const client = new Anthropic({ apiKey });
  const userContent =
    "Extract editable values from these inline scripts. Each is labelled with its index.\n\n" +
    scripts
      .map((s) => `--- SCRIPT ${s.index} ---\n${s.content}`)
      .join("\n\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userContent }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "refusal", message: "The request was declined." },
        { status: 422 }
      );
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return NextResponse.json({ fields: [] satisfies RawScriptField[] });
    }
    const parsed = JSON.parse(text.text) as { fields: RawScriptField[] };
    return NextResponse.json({ fields: parsed.fields ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed.";
    return NextResponse.json({ error: "extraction_failed", message }, { status: 502 });
  }
}
