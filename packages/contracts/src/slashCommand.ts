import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import { ThreadId } from "./baseSchemas";

export const SlashCommandCategory = Schema.Literals(["skill", "builtin", "client-local"]);
export type SlashCommandCategory = typeof SlashCommandCategory.Type;

export const SlashCommandDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.String,
  argumentHint: Schema.String,
  category: SlashCommandCategory,
});
export type SlashCommandDescriptor = typeof SlashCommandDescriptor.Type;

export const SlashCommandListResult = Schema.Struct({
  commands: Schema.Array(SlashCommandDescriptor),
});
export type SlashCommandListResult = typeof SlashCommandListResult.Type;

export const SessionListCommandsInput = Schema.Struct({
  threadId: ThreadId,
});
export type SessionListCommandsInput = typeof SessionListCommandsInput.Type;
