import type { EnvironmentId } from "@marcode/contracts";
import { useEffect, useState } from "react";
import { resolveEnvironmentHttpUrl } from "../environments/runtime";
import { ProjectSeededIcon } from "./ProjectSeededIcon";

const FALLBACK_MARKER = 'data-fallback="project-favicon"';
const projectFaviconResolutionCache = new Map<string, "real" | "fallback">();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  seed: string;
  className?: string | undefined;
  iconClassName?: string | undefined;
}) {
  const src = resolveEnvironmentHttpUrl({
    environmentId: input.environmentId,
    pathname: "/api/project-favicon",
    searchParams: { cwd: input.cwd },
  });
  const [resolution, setResolution] = useState<"loading" | "real" | "fallback">(
    () => projectFaviconResolutionCache.get(src) ?? "loading",
  );

  useEffect(() => {
    const cached = projectFaviconResolutionCache.get(src);
    if (cached) {
      setResolution(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          projectFaviconResolutionCache.set(src, "fallback");
          if (!cancelled) setResolution("fallback");
          return;
        }
        const text = await response.text();
        const next: "real" | "fallback" = text.includes(FALLBACK_MARKER) ? "fallback" : "real";
        projectFaviconResolutionCache.set(src, next);
        if (!cancelled) setResolution(next);
      } catch {
        projectFaviconResolutionCache.set(src, "fallback");
        if (!cancelled) setResolution("fallback");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (resolution === "real") {
    return (
      <img
        src={src}
        alt=""
        className={`size-5 shrink-0 rounded-md object-contain ${input.className ?? ""}`}
      />
    );
  }

  return (
    <ProjectSeededIcon
      seed={input.seed}
      className={input.className}
      iconClassName={input.iconClassName}
    />
  );
}
