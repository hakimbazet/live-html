"use client";

import { useDocument } from "@/hooks/use-document";
import { UploadScreen } from "@/components/upload-screen";
import { EditorWorkspace } from "@/components/editor-workspace";

export default function Home() {
  const doc = useDocument();

  if (!doc.state.loaded) {
    return <UploadScreen doc={doc} />;
  }
  return <EditorWorkspace doc={doc} />;
}
