import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/src/components/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OnlyBoth",
    template: "%s · OnlyBoth",
  },
  description: "Label-blind, attention-backed work proofs.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <span>OnlyBoth · Persistent blind-review product slice</span>
          <span>Hide the labels. Stake the attention. Test the work.</span>
        </footer>
      </body>
    </html>
  );
}
