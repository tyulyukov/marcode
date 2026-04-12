import type { EnvironmentId, ExecutionEnvironmentDescriptor } from "@marcode/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface ServerEnvironmentShape {
  readonly getEnvironmentId: Effect.Effect<EnvironmentId>;
  readonly getDescriptor: Effect.Effect<ExecutionEnvironmentDescriptor>;
}

export class ServerEnvironment extends Context.Service<ServerEnvironment, ServerEnvironmentShape>()(
  "marcode/environment/Services/ServerEnvironment",
) {}
