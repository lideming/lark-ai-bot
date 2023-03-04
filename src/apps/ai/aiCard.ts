import { createI18nCard } from "../../utils/card.ts";

export function getAiCard(text: string) {
  return createI18nCard(i18n, (I) => [
    {
      tag: "markdown",
      content: text || I("Thinking..."),
    },
  ]);
}

export function getTextCard(text: string) {
  return createI18nCard(i18n, (I) => [
    {
      tag: "markdown",
      content: I(text),
    },
  ]);
}

const i18n: Record<string, string> = {
  "Thinking...": "思考中……",
  "[chat history cleared]": "[聊天记录已清除]",
};
