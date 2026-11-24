import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Highlife Talent",
  description: "Recruitment automation for Highlife's Sri Lanka hiring: scorecards, Exa sourcing, Claude scoring, shortlist review and outreach drafts.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
