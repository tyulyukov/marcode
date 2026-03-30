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
    if (!api?.jira.onConnectionStatusChanged) return;
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
          <div className="text-sm font-medium">Jira</div>
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
