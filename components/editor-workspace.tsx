"use client";

import { useState } from "react";
import type { UseDocument } from "@/hooks/use-document";
import { Toolbar } from "./toolbar";
import { FieldPanel } from "./field-panel";
import { PreviewPane } from "./preview-pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export function EditorWorkspace({ doc }: { doc: UseDocument }) {
  const [search, setSearch] = useState("");

  return (
    <main className="flex h-screen min-h-0 flex-col">
      <Toolbar doc={doc} search={search} onSearch={setSearch} />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={45} minSize={28}>
          <FieldPanel doc={doc} search={search} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={30}>
          <PreviewPane html={doc.updatedHtml} showCdnHint={doc.hasExternalScripts} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
