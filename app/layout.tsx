import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Live HTML — Edit AI dashboards",
  description:
    "Upload an AI-generated HTML dashboard and edit its data live through an intuitive table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
