import type { ServerAuthDescriptor } from "@marcode/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface ServerAuthPolicyShape {
  readonly getDescriptor: () => Effect.Effect<ServerAuthDescriptor>;
}

export class ServerAuthPolicy extends Context.Service<ServerAuthPolicy, ServerAuthPolicyShape>()(
  "marcode/auth/Services/ServerAuthPolicy",
) {}
