import type { ConversationWidth } from "@marcode/contracts/settings";

export const CHAT_COLUMN_MAX_WIDTH_BY_CONVERSATION_WIDTH: Record<ConversationWidth, string> = {
  narrow: "44rem",
  comfortable: "52rem",
  wide: "60rem",
};

export const CONVERSATION_WIDTH_OPTIONS: ReadonlyArray<{
  value: ConversationWidth;
  label: string;
  description: string;
  previewWidth: string;
}> = [
  {
    value: "narrow",
    label: "Narrow",
    description: "Keeps long chats tighter and easier to scan.",
    previewWidth: "56%",
  },
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Balanced width for everyday writing and review.",
    previewWidth: "72%",
  },
  {
    value: "wide",
    label: "Wide",
    description: "Gives code blocks and long replies more room.",
    previewWidth: "88%",
  },
];

export function applyAppearanceSettingsToDOM(input: {
  conversationWidth: ConversationWidth;
  reduceMotion: boolean;
  ambientGrain: boolean;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty(
    "--chat-column-max-width",
    CHAT_COLUMN_MAX_WIDTH_BY_CONVERSATION_WIDTH[input.conversationWidth],
  );
  root.dataset.reduceMotion = input.reduceMotion ? "true" : "false";
  root.dataset.ambientGrain = input.ambientGrain ? "true" : "false";
}
