import { COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME } from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const JIRA_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-1 rounded-md border border-[#1868DB]/30 bg-[#1868DB]/12 px-1.5 py-px font-medium text-[12px] leading-[1.1] text-[#4C9AFF] align-middle dark:border-[#4C9AFF]/25 dark:bg-[#4C9AFF]/10 dark:text-[#4C9AFF]";

interface JiraTaskInlineChipProps {
  label: string;
  tooltipText: string;
}

function JiraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none">
      <defs>
        <linearGradient id="jira-blue-1" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#0052CC" />
          <stop offset="100%" stopColor="#2684FF" />
        </linearGradient>
        <linearGradient id="jira-blue-2" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#0052CC" />
          <stop offset="100%" stopColor="#2684FF" />
        </linearGradient>
      </defs>
      <path
        d="M22.16 11.1L13.07 2.01 12 .94 4.53 8.41.84 12.1a.95.95 0 000 1.34l6.8 6.8L12 24.6l7.47-7.47.21-.21 2.48-2.48a.95.95 0 000-1.34zM12 15.53L9.25 12.8 12 10.05l2.75 2.75L12 15.53z"
        fill="url(#jira-blue-1)"
      />
      <path
        d="M12 10.05a4.46 4.46 0 01-.02-6.3l-5.4 5.4L9.25 11.8 12 10.05z"
        fill="url(#jira-blue-2)"
      />
      <path
        d="M14.77 12.78L12 15.53a4.46 4.46 0 01.02 6.3l5.38-5.38-2.63-2.67z"
        fill="url(#jira-blue-1)"
      />
    </svg>
  );
}

export function JiraTaskInlineChip(props: JiraTaskInlineChipProps) {
  const { label, tooltipText } = props;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={JIRA_CHIP_CLASS_NAME} data-jira-context="true">
            <JiraIcon />
            <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
          </span>
        }
      />
      <TooltipPopup side="top" className="max-w-80 whitespace-pre-wrap leading-tight">
        {tooltipText}
      </TooltipPopup>
    </Tooltip>
  );
}
