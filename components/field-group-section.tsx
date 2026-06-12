"use client";

import type { Field, FieldGroup } from "@/lib/types";
import type { UseDocument } from "@/hooks/use-document";
import { FieldRow } from "./field-row";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export function FieldGroupSection({
  group,
  fields,
  doc,
}: {
  group: FieldGroup;
  fields: Field[];
  doc: UseDocument;
}) {
  if (fields.length === 0) return null;
  return (
    <AccordionItem value={group.id}>
      <AccordionTrigger className="px-1">
        <span className="flex items-center gap-2">
          {group.label}
          <Badge variant="secondary" className="font-normal">
            {fields.length}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-1">
        <div className="divide-y">
          {fields.map((f) => (
            <FieldRow key={f.id} field={f} doc={doc} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
