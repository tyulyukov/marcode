import { memo, useEffect, useRef, useState, type ReactNode } from "react";

const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 1800;
const MS_PER_CHAR = 0.8;

function computeRevealDuration(textLength: number): number {
  return Math.min(Math.max(textLength * MS_PER_CHAR, MIN_DURATION_MS), MAX_DURATION_MS);
}

interface TextRevealContainerProps {
  children: ReactNode;
  animate: boolean;
  textLength: number;
}

function TextRevealContainer({ children, animate, textLength }: TextRevealContainerProps) {
  const [animating, setAnimating] = useState(animate);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animating) return;
    const el = containerRef.current;
    if (!el) return;

    const handleEnd = () => setAnimating(false);
    el.addEventListener("animationend", handleEnd, { once: true });
    return () => el.removeEventListener("animationend", handleEnd);
  }, [animating]);

  const durationMs = animating ? computeRevealDuration(textLength) : undefined;

  return (
    <div
      ref={containerRef}
      className={animating ? "text-reveal-animating" : undefined}
      style={
        durationMs !== undefined
          ? ({ "--text-reveal-duration": `${durationMs}ms` } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}

export default memo(TextRevealContainer);
