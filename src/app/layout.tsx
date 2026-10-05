import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendMatch — find your best-fit US business lenders",
  description:
    "Describe your situation. LendMatch researches current US lending products live and ranks the 10 best matches with plain-language reasons and sources.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
