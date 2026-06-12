"use client";

import type { Field } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const isNumber = field.kind === "script-number";
  const invalid = isNumber && value.trim() !== "" && !Number.isFinite(Number(value));
  const longText =
    field.meta.longValue || value.length > 80 || field.original.length > 80;

  if (longText) {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={field.meta.longValue ? 2 : 3}
        className="font-mono text-xs"
      />
    );
  }

  return (
    <Input
      value={value}
      inputMode={isNumber ? "decimal" : undefined}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value)}
      className={cn(isNumber && "font-mono")}
    />
  );
}
