import type { ReactNode } from "react";

interface AnsiStyle {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  fg: string | null;
  bg: string | null;
}

const SGR_COLORS_16: Record<number, string> = {
  30: "#4e4e4e",
  31: "#e06c75",
  32: "#98c379",
  33: "#e5c07b",
  34: "#61afef",
  35: "#c678dd",
  36: "#56b6c2",
  37: "#abb2bf",
  90: "#5c6370",
  91: "#e06c75",
  92: "#98c379",
  93: "#e5c07b",
  94: "#61afef",
  95: "#c678dd",
  96: "#56b6c2",
  97: "#ffffff",
};

const SGR_BG_COLORS_16: Record<number, string> = {
  40: "#4e4e4e",
  41: "#e06c75",
  42: "#98c379",
  43: "#e5c07b",
  44: "#61afef",
  45: "#c678dd",
  46: "#56b6c2",
  47: "#abb2bf",
  100: "#5c6370",
  101: "#e06c75",
  102: "#98c379",
  103: "#e5c07b",
  104: "#61afef",
  105: "#c678dd",
  106: "#56b6c2",
  107: "#ffffff",
};

const XTERM_256: ReadonlyArray<string> = build256Palette();

function build256Palette(): string[] {
  const palette: string[] = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push(
          `#${toHex(r ? 55 + r * 40 : 0)}${toHex(g ? 55 + g * 40 : 0)}${toHex(b ? 55 + b * 40 : 0)}`,
        );
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    palette.push(`#${toHex(v)}${toHex(v)}${toHex(v)}`);
  }
  return palette;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function defaultStyle(): AnsiStyle {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    fg: null,
    bg: null,
  };
}

const ANSI_RE = /\x1b\[([0-9;]*)m/g;

function parseSgrParams(raw: string, style: AnsiStyle): void {
  const codes = raw.length === 0 ? [0] : raw.split(";").map(Number);
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c === 0) {
      Object.assign(style, defaultStyle());
    } else if (c === 1) {
      style.bold = true;
    } else if (c === 2) {
      style.dim = true;
    } else if (c === 3) {
      style.italic = true;
    } else if (c === 4) {
      style.underline = true;
    } else if (c === 9) {
      style.strikethrough = true;
    } else if (c === 22) {
      style.bold = false;
      style.dim = false;
    } else if (c === 23) {
      style.italic = false;
    } else if (c === 24) {
      style.underline = false;
    } else if (c === 29) {
      style.strikethrough = false;
    } else if (c >= 30 && c <= 37) {
      style.fg = SGR_COLORS_16[c] ?? null;
    } else if (c === 38) {
      const next = codes[i + 1];
      if (next === 5 && i + 2 < codes.length) {
        style.fg = XTERM_256[codes[i + 2]!] ?? null;
        i += 2;
      } else if (next === 2 && i + 4 < codes.length) {
        style.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    } else if (c === 39) {
      style.fg = null;
    } else if (c >= 40 && c <= 47) {
      style.bg = SGR_BG_COLORS_16[c] ?? null;
    } else if (c === 48) {
      const next = codes[i + 1];
      if (next === 5 && i + 2 < codes.length) {
        style.bg = XTERM_256[codes[i + 2]!] ?? null;
        i += 2;
      } else if (next === 2 && i + 4 < codes.length) {
        style.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    } else if (c === 49) {
      style.bg = null;
    } else if (c >= 90 && c <= 97) {
      style.fg = SGR_COLORS_16[c] ?? null;
    } else if (c >= 100 && c <= 107) {
      style.bg = SGR_BG_COLORS_16[c] ?? null;
    }
  }
}

function styleToCSS(style: AnsiStyle): React.CSSProperties | undefined {
  const css: React.CSSProperties = {};
  let hasProps = false;
  if (style.fg) {
    css.color = style.fg;
    hasProps = true;
  }
  if (style.bg) {
    css.backgroundColor = style.bg;
    hasProps = true;
  }
  if (style.bold) {
    css.fontWeight = "bold";
    hasProps = true;
  }
  if (style.dim) {
    css.opacity = 0.6;
    hasProps = true;
  }
  if (style.italic) {
    css.fontStyle = "italic";
    hasProps = true;
  }
  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    css.textDecoration = decorations.join(" ");
    hasProps = true;
  }
  return hasProps ? css : undefined;
}

export function ansiToSpans(text: string): ReactNode {
  if (!text.includes("\x1b[")) return text;

  const spans: ReactNode[] = [];
  const style = defaultStyle();
  let lastIndex = 0;
  let key = 0;

  ANSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.length > 0) {
      const css = styleToCSS(style);
      spans.push(
        css ? (
          <span key={key++} style={css}>
            {before}
          </span>
        ) : (
          before
        ),
      );
    }
    parseSgrParams(match[1]!, style);
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.length > 0) {
    const css = styleToCSS(style);
    spans.push(
      css ? (
        <span key={key++} style={css}>
          {remaining}
        </span>
      ) : (
        remaining
      ),
    );
  }

  return spans.length === 1 ? spans[0] : spans;
}
