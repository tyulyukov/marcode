import { useEffect } from "react";
import type { CodeFont } from "@marcode/contracts/settings";

import { useSettings } from "./useSettings";
import { reapplyCurrentTheme } from "./useTheme";

const REDUCE_MOTION_ATTR = "data-reduce-motion";
const CODE_FONT_VAR = "--font-mono";
const FONT_LINK_ID = "appearance-code-font-link";

const CODE_FONT_STACK: Record<Exclude<CodeFont, "system">, string> = {
  "jetbrains-mono": "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace",
  "fira-code": "'Fira Code', ui-monospace, SFMono-Regular, Consolas, monospace",
  "ibm-plex-mono": "'IBM Plex Mono', ui-monospace, SFMono-Regular, Consolas, monospace",
};

const CODE_FONT_LINK_HREF: Record<Exclude<CodeFont, "system">, string> = {
  "jetbrains-mono":
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap",
  "fira-code": "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap",
  "ibm-plex-mono":
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap",
};

function ensureFontLink(font: Exclude<CodeFont, "system">): void {
  const href = CODE_FONT_LINK_HREF[font];
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}

function removeFontLink(): void {
  document.getElementById(FONT_LINK_ID)?.remove();
}

export function useAppearanceEffects(): void {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const codeFont = useSettings((s) => s.codeFont);
  const accentOverride = useSettings((s) => s.accentOverride);

  useEffect(() => {
    const html = document.documentElement;
    if (reduceMotion) {
      html.setAttribute(REDUCE_MOTION_ATTR, "true");
    } else {
      html.removeAttribute(REDUCE_MOTION_ATTR);
    }
  }, [reduceMotion]);

  useEffect(() => {
    if (codeFont === "system") {
      document.documentElement.style.removeProperty(CODE_FONT_VAR);
      removeFontLink();
      return;
    }
    document.documentElement.style.setProperty(CODE_FONT_VAR, CODE_FONT_STACK[codeFont]);
    ensureFontLink(codeFont);
  }, [codeFont]);

  // Accent application lives inside `applyTheme` (see useTheme.ts) so it
  // survives every theme re-apply (mounts of useTheme in other components,
  // OS color-scheme changes, manual theme picks). Here we just trigger a
  // full theme reapply whenever the user's accent preference changes.
  useEffect(() => {
    reapplyCurrentTheme();
  }, [accentOverride]);
}
