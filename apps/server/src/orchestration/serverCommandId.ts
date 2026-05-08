import { CommandId } from "@marcode/contracts";

/**
 * Mints a `CommandId` for a server-issued internal orchestration command (one
 * that the reactor or an HTTP/WS handler dispatches without being prompted by a
 * client). Tagging makes it obvious in the event log which subsystem issued
 * which command.
 */
export const serverCommandId = (tag: string): CommandId =>
  CommandId.make(`server:${tag}:${crypto.randomUUID()}`);
