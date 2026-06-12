"use client";

import { useState } from "react";
import { Download, FilePlus2, RotateCcw, Search, FileText } from "lucide-react";
import type { UseDocument } from "@/hooks/use-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Toolbar({
  doc,
  search,
  onSearch,
}: {
  doc: UseDocument;
  search: string;
  onSearch: (v: string) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const download = () => {
    const blob = new Blob([doc.updatedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = doc.state.fileName.replace(/\.html?$/i, "");
    a.href = url;
    a.download = `${base || "dashboard"}.edited.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-3 border-b px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate text-sm font-medium">{doc.state.fileName}</span>
      </div>

      <div className="relative ml-auto w-56 max-w-[40vw]">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search fields…"
          className="pl-8"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={!doc.hasEdits}
        onClick={() => setConfirmReset(true)}
      >
        <RotateCcw className="size-4" />
        Reset all
      </Button>
      <Button size="sm" onClick={download}>
        <Download className="size-4" />
        Download HTML
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirmNew(true)}>
        <FilePlus2 className="size-4" />
        New file
      </Button>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all edits?</DialogTitle>
            <DialogDescription>
              This restores every field to its original value. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                doc.resetAll();
                setConfirmReset(false);
              }}
            >
              Reset all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start with a new file?</DialogTitle>
            <DialogDescription>
              Your current document and edits will be cleared. Download first if you
              want to keep them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmNew(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                doc.clear();
                setConfirmNew(false);
              }}
            >
              Clear &amp; upload new
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
