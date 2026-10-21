import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iBridge — IBM i Web Console",
  description: "A modern web console for IBM i: run real SQL and CL on a live system, drive an interactive 5250 terminal in your browser, and use the REST API — no emulator to install.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
