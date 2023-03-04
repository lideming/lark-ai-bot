import { Router } from "oak/mod.ts";
import { getAiCard, getTextCard } from "./aiCard.ts";
import { createEventHandler, lark } from "../../utils/lark.ts";
import { getCompletionDelta, Message } from "./openaiClient.ts";
import { ChatStore } from "./chatState.ts";
import { AppConfig } from "../../config.ts";

export interface AiAppConfig extends AppConfig {
  // OpenAI api key
  token: string;
  systemPrompt?: string;
}

export function createApp(appId: string, appConfig: AiAppConfig) {
  const larkClient = new lark.Client({
    appId: appConfig.lark.appId,
    appSecret: appConfig.lark.appSecret,
    //   appType: lark.AppType.SelfBuild,
    //   domain: lark.Domain.Feishu,
  });

  const chatStore = new ChatStore();
  chatStore.init(appId);

  const router = new Router();

  const { eventHandler, eventDispatcher } = createEventHandler({
    verificationToken: appConfig.lark.verificationToken,
  });

  router.post("/events", eventHandler);

  router.post("/interactive-events", async (ctx) => {
    const json = await ctx.request.body({ type: "json" }).value;
    console.info("interactive-events", json);
    if (json.challenge) {
      ctx.response.type = "json";
      ctx.response.body = { challenge: json.challenge };
      return;
    }

    let {} = json.action.value;

    ctx.response.type = "json";
    ctx.response.body = {};
  });

  eventDispatcher.register({
    "im.message.receive_v1": async (data) => {
      const { chat_id, chat_type, message_id } = data.message;
      // console.info("received message", data.message);

      if (parseInt(data.message.create_time) < Date.now() - 10 * 1000) {
        console.info("ignored message (outdated)");
        return;
      }

      if (data.message.message_type != "text") {
        console.info("ignored message (non text)");
        return;
      }

      let textContent: string = JSON.parse(data.message.content).text;

      if (textContent.includes("@_all")) {
        console.info("ignored message (@_all)");
        return;
      }

      if (data.message.mentions) {
        for (const mention of data.message.mentions) {
          textContent = textContent.replaceAll(mention.key, "");
        }
      }

      textContent = textContent.trim();

      if (!textContent) return;

      const chatState = await chatStore.getChat(chat_id, chat_type);

      if (textContent === "!reset") {
        chatState.messages = [];
        await chatStore.updateChat(chatState);
        await larkClient.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: {
            receive_id: chat_id,
            content: JSON.stringify(getTextCard("[chat history cleared]")),
            msg_type: "interactive",
          },
        });
        return;
      }

      if (textContent.startsWith("!system")) {
        const systemPrompt = textContent.slice("!system".length).trim();
        if (systemPrompt) {
          if (systemPrompt === "default") {
            delete chatState.settings.systemPrompt;
          } else {
            chatState.settings.systemPrompt = systemPrompt;
          }
          await chatStore.updateChat(chatState);
          await larkClient.im.message.create({
            params: { receive_id_type: "chat_id" },
            data: {
              receive_id: chat_id,
              content: JSON.stringify(getTextCard("[system prompt updated]")),
              msg_type: "interactive",
            },
          });
        } else {
          await larkClient.im.message.create({
            params: { receive_id_type: "chat_id" },
            data: {
              receive_id: chat_id,
              content: JSON.stringify(
                getTextCard(chatState.settings.systemPrompt || "(default)"),
              ),
              msg_type: "interactive",
            },
          });
        }
        return;
      }

      // if (chat_type === "group" && chatState.name === undefined) {
      //   const groupInfo = await larkClient.im.chat.get({
      //     path: {
      //       chat_id: chat_id,
      //     },
      //   });
      //   chatState.name = groupInfo.data?.name;
      // }

      const systemContent = chatState.settings.systemPrompt ||
        appConfig.systemPrompt;

      const userInput: Message = { role: "user", content: textContent };
      const botMsg: Message = { role: "assistant", content: "" };
      const promptMessages: Message[] = [];
      if (systemContent) {
        promptMessages.push({ role: "system", content: systemContent });
      }
      promptMessages.push(...chatState.messages);
      promptMessages.push(userInput);

      chatState.messages.push(userInput, botMsg);

      let text = "";
      let timer = 0;
      let cardSent = false;
      let finished = false;

      getCompletionDelta({
        apiKey: appConfig.token,
        messages: promptMessages,
        onDelta: (delta) => {
          text += delta;
          botMsg.content += delta;
          delayUpdateCard();
        },
        onFinished: (reason) => {
          if (reason !== "stop") {
            text += "\n[FINISHED: " + reason + "]";
          }
        },
      }).catch((err) => {
        console.error("AI error", err);
        text += "\n[ERROR: " + err + "]";
      }).finally(() => {
        finished = true;
        delayUpdateCard();
        chatStore.updateChat(chatState);
      });

      const delayUpdateCard = () => {
        const updateCard = () => {
          if (!cardSent) {
            delayUpdateCard();
            return;
          }
          larkClient.im.message.patch({
            data: {
              content: JSON.stringify(
                getAiCard(text + (finished ? "" : "[...]")),
              ),
            },
            path: { message_id: cardMsgId },
          });
        };

        if (!timer) {
          timer = setTimeout(() => {
            timer = 0;
            updateCard();
          }, 500);
        }
      };

      const msg = await larkClient.im.message.reply({
        path: { message_id: message_id },
        data: {
          content: JSON.stringify(getAiCard("")),
          msg_type: "interactive",
        },
      });

      const cardMsgId = msg.data!.message_id!;
      cardSent = true;
    },
  });

  return { router };
}
