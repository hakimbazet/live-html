"use client";

import { useEffect, useRef } from "react";
import { RefreshCw, Info } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";

export function PreviewPane({
  html,
  showCdnHint,
}: {
  html: string;
  showCdnHint: boolean;
}) {
  const debounced = useDebouncedValue(html, 400);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // srcDoc updates reload the document, which fully re-initializes scripts
  // (e.g. Chart.js). The key forces a remount on manual reload.
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.srcdoc = debounced;
  }, [debounced]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-medium">
          Live preview
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (iframeRef.current) iframeRef.current.srcdoc = debounced;
          }}
        >
          <RefreshCw className="size-3.5" />
          Reload
        </Button>
      </div>
      {showCdnHint && (
        <div className="text-muted-foreground bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <Info className="size-3.5 shrink-0" />
          This dashboard loads scripts from a CDN; charts only render with network
          access.
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Dashboard preview"
        sandbox="allow-scripts"
        className="min-h-0 flex-1 bg-white"
      />
    </div>
  );
}
