import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/src/components/app-shell";
import { CareerMutualTrademark } from "@/src/components/career-mutual-trademark";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CareerMutual",
    template: "%s · CareerMutual",
  },
  description: "Mutual-intent hiring with label-blind answers and backed human attention.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <span className="site-footer-brand">
            <CareerMutualTrademark />
            <span>Mutual-intent hiring</span>
          </span>
          <span>Signal intent. Commit attention. Let the work earn the conversation.</span>
        </footer>
      </body>
    </html>
  );
}
