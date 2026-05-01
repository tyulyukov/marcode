import { Fragment } from "react";

import { useTheme } from "../../hooks/useTheme";
import { THEME_GROUPS, THEME_REGISTRY } from "../../themes";
import { ScrollArea } from "../ui/scroll-area";
import { ThemePreviewCard } from "./ThemePreviewCard";

export function ThemeCarousel() {
  const { theme, activeTheme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-4 p-4">
      <ThemePreviewCard
        mode={theme === "system" ? { kind: "system" } : { kind: "theme", theme: activeTheme }}
        size="preview"
      />

      <ScrollArea scrollFade>
        <div className="flex snap-x snap-proximity gap-3 px-4 pt-1 pb-3">
          <ThemePreviewCard
            mode={{ kind: "system" }}
            size="card"
            label="System"
            selected={theme === "system"}
            onClick={() => setTheme("system")}
          />

          {THEME_GROUPS.map(({ group, label }) => {
            const groupThemes = THEME_REGISTRY.filter((t) => t.group === group);
            if (groupThemes.length === 0) return null;
            return (
              <Fragment key={group}>
                <FamilySeparator label={label} />
                {groupThemes.map((definition) => (
                  <ThemePreviewCard
                    key={definition.id}
                    mode={{ kind: "theme", theme: definition }}
                    size="card"
                    label={definition.label}
                    selected={theme === definition.id}
                    onClick={() => setTheme(definition.id)}
                  />
                ))}
              </Fragment>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function FamilySeparator({ label }: { label: string }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 self-stretch px-1"
      aria-hidden
      role="presentation"
    >
      <div className="h-12 w-px bg-border" />
      <span className="rotate-180 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 [writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  );
}
