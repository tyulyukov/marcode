import { Skeleton } from "./ui/skeleton";
import {
  SidebarContent,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";
import { cn } from "~/lib/utils";
import { isElectron } from "../env";

export function ChatViewSkeleton() {
  const { isMobile, state: sidebarState } = useSidebar();
  const sidebarVisible = !isMobile && sidebarState === "expanded";

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border",
            isElectron && !sidebarVisible ? "pr-3 sm:pr-5 pl-[90px]" : "px-3 sm:px-5",
            isElectron ? "drag-region flex h-[52px] items-center" : "py-2 sm:py-3",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <Skeleton className="h-5 w-40 rounded" />
              <Skeleton className="h-5.5 w-16 rounded-sm sm:h-4.5" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-7 rounded-md sm:size-6" />
              <Skeleton className="size-7 rounded-md sm:size-6" />
              <Skeleton className="size-7 rounded-md sm:size-6" />
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 sm:py-4">
          <div className="mx-auto w-full min-w-0 max-w-3xl px-1">
            <div className="flex flex-col gap-6 py-4">
              <div className="flex items-start gap-3">
                <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-4 w-1/2 rounded" />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 size-6 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-5/6 rounded" />
                  <Skeleton className="h-4 w-4/6 rounded" />
                  <Skeleton className="h-20 w-full rounded-md" />
                  <Skeleton className="h-4 w-3/5 rounded" />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 size-6 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export function SidebarProjectsSkeleton() {
  return (
    <SidebarContent className="gap-0">
      <SidebarGroup className="px-2 pt-2 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Skeleton className="size-3.5 shrink-0 rounded" />
              <Skeleton className="h-3.5 flex-1 rounded" />
              <Skeleton className="h-4 w-6 shrink-0 rounded-sm" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup className="px-2 py-2">
        <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
          <Skeleton className="h-2.5 w-16 rounded" />
          <div className="flex items-center gap-1">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="size-5 rounded" />
          </div>
        </div>
        <div className="flex flex-col gap-3 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 px-2 py-1">
                <Skeleton className="size-3.5 shrink-0 rounded" />
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton
                  className={`h-3.5 rounded ${i === 0 ? "w-28" : i === 1 ? "w-20" : "w-24"}`}
                />
              </div>
              <div className="flex flex-col gap-1 pl-5 pr-2">
                <Skeleton className="h-6 w-full rounded-md" />
                <Skeleton className="h-6 w-full rounded-md" />
                {i === 0 && <Skeleton className="h-6 w-full rounded-md" />}
              </div>
            </div>
          ))}
        </div>
      </SidebarGroup>
    </SidebarContent>
  );
}
