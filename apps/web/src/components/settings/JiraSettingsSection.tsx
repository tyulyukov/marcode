import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ensureNativeApi, readNativeApi } from "../../nativeApi";
import { jiraConnectionStatusQueryOptions, jiraQueryKeys } from "../../lib/jiraReactQuery";
import { getServerHttpOrigin } from "../../env";
import { Button } from "../ui/button";

export function JiraSettingsSection() {
  const queryClient = useQueryClient();
  const connectionQuery = useQuery(jiraConnectionStatusQueryOptions());
  const isConnected = connectionQuery.data?.connected ?? false;
  const user = connectionQuery.data?.user;
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const api = readNativeApi();
    if (!api?.jira?.onConnectionStatusChanged) return;
    const unsubscribe = api.jira.onConnectionStatusChanged((status) => {
      queryClient.setQueryData(jiraQueryKeys.connectionStatus(), status);
    });
    return unsubscribe;
  }, [queryClient]);

  const handleConnect = () => {
    const origin = getServerHttpOrigin();
    window.open(`${origin}/api/jira/auth`, "_blank");
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await ensureNativeApi().jira.disconnect();
      await queryClient.invalidateQueries({ queryKey: jiraQueryKeys.all });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
              <path
                d="M22.16 11.1L13.07 2.01 12 .94 4.53 8.41.84 12.1a.95.95 0 000 1.34l6.8 6.8L12 24.6l7.47-7.47.21-.21 2.48-2.48a.95.95 0 000-1.34zM12 15.53L9.25 12.8 12 10.05l2.75 2.75L12 15.53z"
                fill="#2684FF"
              />
              <path
                d="M12 10.05a4.46 4.46 0 01-.02-6.3l-5.4 5.4L9.25 11.8 12 10.05z"
                fill="#0052CC"
              />
              <path
                d="M14.77 12.78L12 15.53a4.46 4.46 0 01.02 6.3l5.38-5.38-2.63-2.67z"
                fill="#2684FF"
              />
            </svg>
            Jira
          </div>
          <div className="text-muted-foreground text-xs">
            {isConnected && user
              ? `Connected as ${user.displayName}`
              : "Connect your Jira account to reference sprint tasks in chat."}
          </div>
        </div>
        <div>
          {isConnected ? (
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleConnect}>
              Connect Jira
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
