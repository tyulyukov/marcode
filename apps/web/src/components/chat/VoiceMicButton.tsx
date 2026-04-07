import { memo, useEffect, useRef } from "react";
import { MicIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface VoiceMicButtonProps {
  status: "idle" | "recording" | "transcribing" | "cleaning-up";
  isSupported: boolean;
  analyserNode: AnalyserNode | null;
  onToggle: () => void;
  shortcutLabel: string | null;
  disabled: boolean;
  voiceEnabled: boolean;
  modelReady: boolean;
}

export const VoiceMicButton = memo(function VoiceMicButton(props: VoiceMicButtonProps) {
  const {
    status,
    isSupported,
    analyserNode,
    onToggle,
    shortcutLabel,
    disabled,
    voiceEnabled,
    modelReady,
  } = props;
  const barsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (status !== "recording" || !analyserNode || !barsRef.current) return;

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const bars = barsRef.current.children;

    const animate = () => {
      analyserNode.getByteFrequencyData(dataArray);
      const bucketSize = Math.floor(dataArray.length / bars.length);
      for (let i = 0; i < bars.length; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += dataArray[i * bucketSize + j]!;
        }
        const avg = sum / bucketSize / 255;
        const height = Math.max(0.2, avg);
        (bars[i] as HTMLElement).style.transform = `scaleY(${height})`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, analyserNode]);

  if (!voiceEnabled || !isSupported) return null;

  const isProcessing = status === "transcribing" || status === "cleaning-up";

  if (!modelReady) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <button
                type="button"
                disabled
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground/40 sm:size-8"
                aria-label="Voice input unavailable"
              >
                <MicIcon className="size-4" />
              </button>
            </span>
          }
        />
        <TooltipPopup side="top">Install a voice model in Settings to use voice input</TooltipPopup>
      </Tooltip>
    );
  }

  if (status === "recording") {
    return (
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center gap-0.5 rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 sm:size-8"
        onClick={onToggle}
        aria-label="Stop recording"
      >
        <div ref={barsRef} className="flex items-center gap-px h-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-[3px] h-full rounded-full bg-white origin-center transition-transform duration-75"
            />
          ))}
        </div>
      </button>
    );
  }

  if (isProcessing) {
    return (
      <button
        type="button"
        disabled
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground/50 sm:size-8"
        aria-label="Processing voice input"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="animate-spin"
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="20 12"
          />
        </svg>
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-all duration-150 hover:text-foreground/80 hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-30 sm:size-8"
            onClick={onToggle}
            aria-label="Voice input"
          />
        }
      >
        <MicIcon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup side="top">
        Voice input{shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
});
