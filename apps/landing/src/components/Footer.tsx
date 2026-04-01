import { GithubIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/50 px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground">
          MarCode &mdash; Open source, built with care.
        </p>
        <a
          href="https://github.com/tyulyukov/marcode"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <GithubIcon className="size-4" />
          GitHub
        </a>
      </div>
    </footer>
  );
}
