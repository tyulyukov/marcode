import { QuoteIcon, XIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface QuotedContextInlineChipProps {
  preview: string;
  tooltipText: string;
  onRemove?: () => void;
}

export function QuotedContextInlineChip(props: QuotedContextInlineChipProps) {
  const { preview, tooltipText, onRemove } = props;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              COMPOSER_INLINE_CHIP_CLASS_NAME,
              "border-violet-500/30 bg-violet-500/12 text-violet-300 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300",
            )}
          >
            <QuoteIcon className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")} />
            <span className={cn(COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME, "max-w-[200px]")}>
              {preview}
            </span>
            {onRemove && (
              <button
                type="button"
                className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                aria-label="Remove quoted context"
              >
                <XIcon className="size-2.5" />
              </button>
            )}
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-80 whitespace-pre-wrap leading-tight">
        {tooltipText}
      </TooltipPopup>
    </Tooltip>
  );
}
