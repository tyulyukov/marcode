import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const klasterSans = localFont({
  src: [
    { path: "../fonts/KlasterSans-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/KlasterSans-Medium.otf", weight: "500", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});

const inter = localFont({
  src: "../fonts/Inter-VariableFont_opsz,wght.ttf",
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MarCode - Minimal GUI for Coding Agents",
  description:
    "A minimal web GUI for using coding agents like Claude Code. Download for macOS, Windows, and Linux.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${klasterSans.variable} ${inter.variable} dark`}>
      <body>{children}</body>
    </html>
  );
}
