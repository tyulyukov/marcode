"use client";

import { DownloadIcon, AppleIcon, MonitorIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { type DetectedOS, OS_LABELS, detectOS } from "~/lib/detectOS";
import { getDownloadUrl, RELEASES_URL } from "~/lib/github";

function OSIcon({ os }: { os: DetectedOS }) {
  switch (os) {
    case "mac":
      return <AppleIcon className="size-5" />;
    default:
      return <MonitorIcon className="size-5" />;
  }
}

export function DownloadButton({ serverOS }: { serverOS: DetectedOS }) {
  const [os, setOS] = useState<DetectedOS>(serverOS);

  useEffect(() => {
    const clientOS = detectOS(navigator.userAgent);
    if (clientOS !== "unknown") {
      setOS(clientOS);
    }
  }, []);

  const downloadUrl = getDownloadUrl(os);
  const label = OS_LABELS[os];

  return (
    <div className="flex flex-col items-center gap-3">
      <a href={downloadUrl} className="group">
        <Button
          size="lg"
          className="relative cursor-pointer gap-3 rounded-xl px-10 py-6 text-lg font-medium shadow-[0_0_40px_rgba(119,230,233,0.2)] transition-shadow hover:shadow-[0_0_60px_rgba(119,230,233,0.35)]"
        >
          <DownloadIcon className="size-5" />
          Download for {label}
          <OSIcon os={os} />
        </Button>
      </a>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline" className="text-xs">
          Free &amp; Open Source
        </Badge>
        <span>&middot;</span>
        <a href={RELEASES_URL} className="underline-offset-4 hover:text-foreground hover:underline">
          All platforms
        </a>
      </div>
    </div>
  );
}
