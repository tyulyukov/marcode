import { ShieldQuestionIcon } from "lucide-react";

export function ApprovalBadge() {
  return (
    <span className="flex items-center gap-1 text-[10px] text-info/80">
      <ShieldQuestionIcon className="size-3" />
      Approval requested
    </span>
  );
}
