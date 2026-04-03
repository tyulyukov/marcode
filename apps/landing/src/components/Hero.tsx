import Image from "next/image";
import type { DetectedOS } from "~/lib/detectOS";
import type { Release } from "~/lib/github";
import { DownloadButton } from "./DownloadButton";

export function Hero({ os, release }: { os: DetectedOS; release: Release | null }) {
  return (
    <section className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-6 py-24">
      {/* Decorative circles (BRAND.md: circle = core element) */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-fresh-syntax/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 size-[500px] rounded-full bg-curious-sky/5 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-dream-shift/5 blur-3xl" />

      <div className="relative z-10 flex max-w-3xl flex-col items-center gap-8 text-center">
        <Image
          src="/marcode-logo.png"
          alt="MarCode"
          width={80}
          height={80}
          className="rounded-2xl"
          priority
        />

        <h1
          className="text-5xl font-medium tracking-tight sm:text-6xl lg:text-7xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          Your coding agent,{" "}
          <span className="bg-gradient-to-r from-fresh-syntax to-curious-sky bg-clip-text text-transparent">
            one tab away
          </span>
        </h1>

        <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          MarCode is a minimal web GUI for Claude Code. Lightweight, fast, and built for developers
          who want to get things done.
        </p>

        <DownloadButton serverOS={os} serverRelease={release} />
      </div>
    </section>
  );
}
