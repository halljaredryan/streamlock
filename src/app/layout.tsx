import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Streamlock — Twitch VODs from your Deadlock matches",
  description:
    "Enter a Steam account to find Twitch VODs recorded by the players you met in your recent Deadlock matches, cued to the moment the match started.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
