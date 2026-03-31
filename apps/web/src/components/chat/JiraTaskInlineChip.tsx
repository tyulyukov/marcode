import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleDotIcon,
  EqualIcon,
  FileIcon,
  ImageIcon,
  MinusIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import ChatMarkdown from "../ChatMarkdown";
import { COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME } from "../composerInlineChip";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const JIRA_CHIP_CLASS_NAME =
  "inline-flex max-w-full select-none items-center gap-1 rounded-md border border-[#1868DB]/30 bg-[#1868DB]/12 px-1.5 py-px font-medium text-[12px] leading-[1.1] text-[#4C9AFF] align-middle dark:border-[#4C9AFF]/25 dark:bg-[#4C9AFF]/10 dark:text-[#4C9AFF]";

const JIRA_CHIP_CLICKABLE_CLASS_NAME = `${JIRA_CHIP_CLASS_NAME} cursor-pointer hover:bg-[#1868DB]/20 dark:hover:bg-[#4C9AFF]/18 transition-colors`;

interface JiraTaskInlineChipProps {
  label: string;
  tooltipText: string;
  detailHeader: string | undefined;
  detailBody: string | undefined;
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-3.5 shrink-0"} fill="none">
      <path
        d="M22.16 11.1L13.07 2.01 12 .94 4.53 8.41.84 12.1a.95.95 0 000 1.34l6.8 6.8L12 24.6l7.47-7.47.21-.21 2.48-2.48a.95.95 0 000-1.34zM12 15.53L9.25 12.8 12 10.05l2.75 2.75L12 15.53z"
        fill="#2684FF"
      />
      <path d="M12 10.05a4.46 4.46 0 01-.02-6.3l-5.4 5.4L9.25 11.8 12 10.05z" fill="#0052CC" />
      <path d="M14.77 12.78L12 15.53a4.46 4.46 0 01.02 6.3l5.38-5.38-2.63-2.67z" fill="#2684FF" />
    </svg>
  );
}

const STATUS_COLORS: Record<string, string> = {
  "to do": "bg-muted-foreground/20 text-muted-foreground",
  "in progress": "bg-[#0052CC]/20 text-[#4C9AFF]",
  "in review": "bg-[#0052CC]/20 text-[#4C9AFF]",
  done: "bg-emerald-500/20 text-emerald-400",
  closed: "bg-emerald-500/20 text-emerald-400",
  planned: "bg-muted-foreground/20 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const colorClass =
    STATUS_COLORS[status.toLowerCase()] ?? "bg-muted-foreground/20 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}
    >
      {status}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string }) {
  const lower = priority.toLowerCase();
  if (lower === "highest" || lower === "critical" || lower === "blocker") {
    return <ArrowUpIcon className="size-3 text-red-400" />;
  }
  if (lower === "high") {
    return <ArrowUpIcon className="size-3 text-orange-400" />;
  }
  if (lower === "medium") {
    return <EqualIcon className="size-3 text-amber-400" />;
  }
  if (lower === "low") {
    return <ArrowDownIcon className="size-3 text-[#4C9AFF]" />;
  }
  if (lower === "lowest") {
    return <MinusIcon className="size-3 text-muted-foreground" />;
  }
  return <CircleDotIcon className="size-3 text-muted-foreground" />;
}

interface ParsedJiraMetadata {
  status: string | undefined;
  priority: string | undefined;
  assignee: string | undefined;
  type: string | undefined;
  url: string | undefined;
  description: string | undefined;
  attachments: ReadonlyArray<{
    filename: string;
    mimeType: string;
    size: string;
    imageUrl: string | undefined;
  }>;
}

function parseJiraBody(body: string): ParsedJiraMetadata {
  const statusMatch = body.match(/Status:\s*([^|]+?)(?:\s*\||$)/);
  const priorityMatch = body.match(/Priority:\s*([^|]+?)(?:\s*\||$)/);
  const assigneeMatch = body.match(/Assignee:\s*([^|]+?)(?:\s*\||$)/);
  const typeMatch = body.match(/Type:\s*([^|\n]+?)(?:\s*\||$)/);
  const urlMatch = body.match(/URL:\s*(https?:\/\/\S+)/);
  const descMatch = body.match(/Description:\n([\s\S]*?)(?=\nAttachments:\n|$)/);
  const attachmentsMatch = body.match(/Attachments:\n([\s\S]*?)$/);
  const description = descMatch?.[1]?.trim() || undefined;

  const imageUrlsByFilename = new Map<string, string>();
  if (description) {
    for (const imgMatch of description.matchAll(/!\[([^\]]+)]\((http[^)]+)\)/g)) {
      imageUrlsByFilename.set(imgMatch[1]!, imgMatch[2]!);
    }
  }

  const attachments: Array<{
    filename: string;
    mimeType: string;
    size: string;
    imageUrl: string | undefined;
  }> = [];
  if (attachmentsMatch?.[1]) {
    for (const line of attachmentsMatch[1].split("\n")) {
      const attMatch = line.match(/^\s+-\s+(.+?)\s+\(([^,]+),\s*(.+?)\)$/);
      if (attMatch) {
        attachments.push({
          filename: attMatch[1]!,
          mimeType: attMatch[2]!,
          size: attMatch[3]!,
          imageUrl: imageUrlsByFilename.get(attMatch[1]!),
        });
      }
    }
  }

  return {
    status: statusMatch?.[1]?.trim(),
    priority: priorityMatch?.[1]?.trim(),
    assignee: assigneeMatch?.[1]?.trim(),
    type: typeMatch?.[1]?.trim(),
    url: urlMatch?.[1]?.trim(),
    description,
    attachments,
  };
}

function ImageLightbox(props: { src: string; alt: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <button
        type="button"
        onClick={props.onClose}
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
      >
        <XIcon className="size-5" />
      </button>
      <img
        src={props.src}
        alt={props.alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function JiraDetailCard(props: { header: string; body: string }) {
  const meta = parseJiraBody(props.body);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  return (
    <div className="flex max-w-80 flex-col gap-3">
      <div className="flex items-start gap-2">
        <JiraIcon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug text-foreground">{props.header}</div>
          {meta.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#4C9AFF] hover:underline"
            >
              Open in Jira ↗
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {meta.status && <StatusBadge status={meta.status} />}
        {meta.priority && (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <PriorityIcon priority={meta.priority} />
            {meta.priority}
          </span>
        )}
        {meta.type && (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {meta.type}
          </span>
        )}
      </div>

      {meta.assignee && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <UserIcon className="size-3 shrink-0" />
          <span>{meta.assignee}</span>
        </div>
      )}

      {meta.description && (
        <div className="relative">
          <div
            className="max-h-72 overflow-auto rounded-md bg-muted/30 p-2 text-[11px] leading-relaxed text-muted-foreground prose-xs prose-invert prose prose-headings:text-[12px] prose-headings:font-semibold prose-headings:text-foreground prose-p:my-1 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-pre:my-1 prose-pre:text-[10px] prose-blockquote:my-1 prose-blockquote:border-[#4C9AFF]/40 prose-hr:my-2 prose-a:text-[#4C9AFF] prose-img:my-2 prose-img:max-w-full prose-img:rounded-md prose-img:border prose-img:border-border/50 prose-img:cursor-zoom-in"
            onClick={(e) => {
              const target = e.target;
              if (target instanceof HTMLImageElement && target.src) {
                e.stopPropagation();
                setLightboxImage({ src: target.src, alt: target.alt || "Jira attachment" });
              }
            }}
          >
            <ChatMarkdown text={meta.description} cwd={undefined} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-md bg-gradient-to-t from-muted/40 to-transparent" />
        </div>
      )}

      {meta.attachments.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Attachments
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meta.attachments.map((att) =>
              att.imageUrl ? (
                <button
                  type="button"
                  key={att.filename}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxImage({ src: att.imageUrl!, alt: att.filename });
                  }}
                  className="inline-flex items-center gap-1 rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <ImageIcon className="size-3 shrink-0" />
                  <span className="max-w-32 truncate">{att.filename}</span>
                  <span className="text-muted-foreground/50">{att.size}</span>
                </button>
              ) : (
                <span
                  key={att.filename}
                  className="inline-flex items-center gap-1 rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  <FileIcon className="size-3 shrink-0" />
                  <span className="max-w-32 truncate">{att.filename}</span>
                  <span className="text-muted-foreground/50">{att.size}</span>
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}

export function JiraTaskInlineChip(props: JiraTaskInlineChipProps) {
  const { label, tooltipText, detailHeader, detailBody } = props;
  const hasDetail = detailHeader !== undefined && detailBody !== undefined;

  if (hasDetail) {
    return (
      <Popover>
        <PopoverTrigger
          render={
            <span className={JIRA_CHIP_CLICKABLE_CLASS_NAME} data-jira-context="true">
              <JiraIcon />
              <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
            </span>
          }
        />
        <PopoverPopup side="top" align="start" sideOffset={6} className="max-w-96">
          <JiraDetailCard header={detailHeader} body={detailBody} />
        </PopoverPopup>
      </Popover>
    );
  }

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
