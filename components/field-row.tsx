"use client";

import { RotateCcw } from "lucide-react";
import type { Field } from "@/lib/types";
import type { UseDocument } from "@/hooks/use-document";
import { FieldInput } from "./field-input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function FieldRow({ field, doc }: { field: Field; doc: UseDocument }) {
  const edited = field.id in doc.state.edits && doc.state.edits[field.id] !== field.original;
  const value = doc.state.edits[field.id] ?? field.original;

  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-2 py-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                edited ? "bg-primary" : "bg-transparent"
              )}
            />
            <span className="text-muted-foreground truncate text-xs" title={field.label}>
              {field.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{field.breadcrumb}</TooltipContent>
      </Tooltip>

      <FieldInput field={field} value={value} onChange={(v) => doc.setEdit(field.id, v)} />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={!edited}
        onClick={() => doc.resetField(field.id)}
        title="Reset to original"
      >
        <RotateCcw className="size-3.5" />
      </Button>
    </div>
  );
}
