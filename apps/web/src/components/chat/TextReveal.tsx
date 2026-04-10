import { memo, useCallback } from "react";
import ChatMarkdown from "../ChatMarkdown";
import { useSmoothReveal } from "../../hooks/useSmoothReveal";

interface AnimatedChatMarkdownProps {
  text: string;
  cwd: string | undefined;
  isStreaming: boolean;
  animate: boolean;
}

function AnimatedChatMarkdown({ text, cwd, isStreaming, animate }: AnimatedChatMarkdownProps) {
  const { containerRef, isRevealing, finish } = useSmoothReveal(animate, text.length);

  const handlePointerDown = useCallback(() => {
    if (isRevealing) finish();
  }, [isRevealing, finish]);

  return (
    <div ref={containerRef} onPointerDown={isRevealing ? handlePointerDown : undefined}>
      <ChatMarkdown text={text} cwd={cwd} isStreaming={isStreaming} />
    </div>
  );
}

export default memo(AnimatedChatMarkdown);
