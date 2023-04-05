import { Router } from "../../dep.ts";
import { getAiCard, getTextCard } from "./aiCard.ts";
import { createEventHandler, lark, uploadFile } from "../../utils/lark.ts";
import {
  getCompletionStream,
  Message,
} from "https://deno.land/x/openai_chat_stream@1.0.2/mod.ts";
import { ChatMessage, ChatState, ChatStore } from "./chatState.ts";
import { AppConfig } from "../../config.ts";
import { encode } from "../../dep.ts";
import { search, SearchConfig } from "../../utils/internetSearch.ts";

export type { Message };

export interface AiAppConfig extends AppConfig {
  // OpenAI api key
  token: string;
  systemPrompt?: string;
  search?: SearchConfig;
}

export const CONTEXT_TOKEN_LIMIT = 3900;

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
      const userMsg = data.message;
      const { chat_id, chat_type } = data.message;
      // console.info("received message", data.message);

      if (parseInt(data.message.create_time) < Date.now() - 30 * 1000) {
        console.info("ignored message (outdated)");
        return;
      }

      if (data.message.message_type != "text") {
        console.info("ignored message (non text)");
        return;
      }

      let inputText: string = JSON.parse(data.message.content).text;

      if (inputText.includes("@_all")) {
        console.info("ignored message (@_all)");
        return;
      }

      if (data.message.mentions) {
        for (const mention of data.message.mentions) {
          inputText = inputText.replaceAll(mention.key, "");
        }
      }

      inputText = inputText.trim();

      if (!inputText) return;

      const chatState = await chatStore.getChat(chat_id, chat_type);

      inputText = await processUserCommand(chatState, inputText) || "";
      if (!inputText) return;

      let replyTo = userMsg.parent_id;

      if (!replyTo && chatState.lastMessageId) {
        const lastMsg = await chatStore.getMessage(chatState.lastMessageId);
        if (lastMsg) {
          if ((+lastMsg.time) >= Date.now() - (3600 * 1000)) {
            replyTo = lastMsg.id;
          }
        }
      }

      const storeUserMsg: ChatMessage = {
        id: userMsg.message_id,
        chat: chat_id,
        time: data.message.create_time,
        replyTo: replyTo,
        role: "user",
        content: inputText,
        tokens: countTokens(inputText),
      };
      await chatStore.putMessage(storeUserMsg);
      await startCompletion(storeUserMsg.id);

      async function startCompletion(inputId: string) {
        const systemContent = chatState.settings.systemPrompt ||
          appConfig.systemPrompt;

        const promptMessages: Message[] = [];
        if (systemContent) {
          promptMessages.push({ role: "user", content: systemContent });
        }
        const contextMessages = await chatStore.getMessageChain(
          inputId,
          CONTEXT_TOKEN_LIMIT,
        );
        promptMessages.push(
          ...contextMessages.map((x) => ({
            role: x.role,
            content: x.content,
          })),
        );
        const promptTokens = promptMessages.reduce(
          (prev, cur) => prev + countTokens(cur.content),
          0,
        );
        const chatParams = chatState.settings.params;

        let text = "";
        let additionalInfo: string[] = [];
        let cardUpdateTimer = 0;
        let cardUpdating = false;
        let finished = false;

        if (!contextMessages.length) {
          additionalInfo.push("new conversation");
        }
        const inputMsgCount = promptMessages.length - (systemContent ? 1 : 0);
        additionalInfo.push(
          `input ${promptTokens} tokens (${inputMsgCount} msg)`,
        );
        if (chatParams?.temp !== undefined) {
          additionalInfo.push(`temp=${chatParams.temp}`);
        }
        if (chatParams?.top_p !== undefined) {
          additionalInfo.push(`top_p=${chatParams.top_p}`);
        }

        const stream = getCompletionStream({
          apiKey: appConfig.token,
          messages: promptMessages,
          params: {
            top_p: chatParams?.top_p,
            temperature: chatParams?.temp,
          },
          onFinished: (reason) => {
            if (reason !== "stop") {
              additionalInfo.push("finished reason: " + reason);
            }
          },
        });

        const renderCard = () => {
          return getAiCard(
            text + (finished ? "" : "[...]"),
            additionalInfo.join(" | "),
          );
        };

        const updateCard = () => {
          if (cardUpdating) {
            delayUpdateCard();
            return;
          }
          cardUpdating = true;
          larkClient.im.message.patch({
            data: {
              content: JSON.stringify(renderCard()),
            },
            path: { message_id: cardMsgId },
          }).catch((err) => {
            console.error("update card error", err);
          }).finally(() => {
            cardUpdating = false;
          });
        };

        const delayUpdateCard = () => {
          if (!cardUpdateTimer) {
            cardUpdateTimer = setTimeout(() => {
              cardUpdateTimer = 0;
              updateCard();
            }, 500);
          }
        };

        const msg = await larkClient.im.message.reply({
          path: { message_id: userMsg.message_id },
          data: {
            content: JSON.stringify(renderCard()),
            msg_type: "interactive",
          },
        });

        const cardMsgId = msg.data!.message_id!;

        try {
          for await (const delta of stream) {
            text += delta;
            delayUpdateCard();
          }
        } catch (err) {
          console.error("AI error", err);
          additionalInfo.push("ERROR: " + err);
          return;
        } finally {
          finished = true;
          const outputTokens = countTokens(text);
          additionalInfo.push(`output ${outputTokens} tokens`);
          delayUpdateCard();

          const storeBotMsg: ChatMessage = {
            id: cardMsgId,
            chat: chat_id,
            time: msg.data!.create_time!,
            replyTo: inputId,
            role: "assistant",
            content: text,
            tokens: outputTokens,
          };
          await chatStore.putMessage(storeBotMsg);
          chatState.requestCount += 1;
          chatState.inputTokenCount += promptTokens;
          chatState.outputTokenCount += outputTokens;
          chatState.lastMessageId = cardMsgId;
          await chatStore.updateChat(chatState);
        }

        const response = await processAICommand(text);
        if (response) {
          console.info("response", response);
          // promptMessages.push({ role: "assistant", content: text });
          const systemContent = JSON.stringify(response);
          const storeSystemMsg: ChatMessage = {
            id: "system_" + cardMsgId,
            chat: chat_id,
            time: Date.now().toString(),
            replyTo: cardMsgId,
            role: "system",
            content: systemContent,
            tokens: countTokens(systemContent),
          };
          await chatStore.putMessage(storeSystemMsg);
          await startCompletion(storeSystemMsg.id);
        }
      }
    },
  });

  async function processUserCommand(
    chatState: ChatState,
    inputText: string,
  ) {
    if (!inputText.startsWith("!")) return inputText;

    const chat_id = chatState.id;

    const replySimpleText = async (text: string) => {
      await larkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chat_id,
          content: JSON.stringify(getTextCard(text)),
          msg_type: "interactive",
        },
      });
    };

    const match = inputText.match(/^!(\w+)\s*(.*)$/s)!;
    const [_, cmd, rest] = match;
    if (cmd === "reset" || cmd === "new") {
      delete chatState.lastMessageId;
      await chatStore.updateChat(chatState);
      if (!rest) {
        await replySimpleText("[new conversation]");
        return;
      }
      inputText = rest;
    }

    if (cmd === "system") {
      const systemPrompt = rest;
      if (systemPrompt) {
        if (systemPrompt === "default") {
          delete chatState.settings.systemPrompt;
        } else {
          chatState.settings.systemPrompt = systemPrompt;
        }
        await chatStore.updateChat(chatState);
        await replySimpleText("[system prompt updated]");
      } else {
        await replySimpleText(
          chatState.settings.systemPrompt || "(default)",
        );
      }
      return;
    }

    if (cmd === "dump") {
      const msgs = await chatStore.getMessagesByChatId(chat_id);
      const dumpContent = createMessagesDump(msgs);
      const fileKey = await uploadFile(larkClient, {
        file_type: "stream",
        file_name: `chat_dump_${
          new Date().toISOString().replaceAll(":", "-")
        }.md`,
        file: dumpContent,
      });
      await larkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chat_id,
          content: JSON.stringify({
            file_key: fileKey,
          }),
          msg_type: "file",
        },
      });
      return;
    }

    if (cmd === "delete_all_data") {
      if (rest === "I AM SURE") {
        const msgs = await chatStore.getMessagesByChatId(chat_id);
        await chatStore.deleteMessages(msgs.map((x) => x.id));
        await replySimpleText(
          "All history messages from this chat are deleted.",
        );
      } else {
        await replySimpleText(
          "All history messages from this chat will be DELETED " +
            "and you will NOT be able to continue on deleted conversations.\n" +
            "Stat counters won't be reset.\n" +
            'You can "!dump" all data before deleting.\n' +
            'If you are sure, use "!delete_all_data I AM SURE" to proceed.',
        );
      }
      return;
    }

    if (cmd === "stat") {
      await replySimpleText(
        `[Chat Stat]\n` +
          `requests: ${chatState.requestCount}\n` +
          `input tokens: ${chatState.inputTokenCount}\n` +
          `output tokens: ${chatState.outputTokenCount}`,
      );
      return;
    }

    if (cmd === "params") {
      let responseText = "";
      if (rest == "default") {
        delete chatState.settings.params;
        await chatStore.updateChat(chatState);
        responseText = "Reset to default params.";
      } else {
        try {
          const params: ChatState["settings"]["params"] = {};
          const kv = rest.split(" ").map((x) => x.split("="));
          if (!kv.length) throw new Error("No key=value pairs");
          for (const [key, value] of kv) {
            if (key === "top_p" || key === "temp") {
              params[key] = parseFloat(value);
            } else {
              throw new Error("Unknown key " + key);
            }
          }
          chatState.settings.params = params;
          await chatStore.updateChat(chatState);
          responseText = "Set new params.";
        } catch (error) {
          console.error("command !params parsing", error);
          responseText = "Usage: !params [top_p=<number>] [temp=<number>]";
        }
      }
      await replySimpleText(responseText);
      return;
    }

    return inputText;
  }

  async function processAICommand(text: string) {
    const match = text.match(/<ai-command>(.*)<\/ai-command>/);
    if (!match) return;
    console.info({ match });
    const commandString = match[1];
    const parsed = JSON.parse(commandString);
    console.info({ parsed });
    const { cmd } = parsed;
    if (cmd === "search_internet") {
      if (!appConfig.search) {
        return {
          error:
            "Command unavailable because search server config is missing.",
        };
      }
      const { query } = parsed;
      const result = await search(appConfig.search, query);
      return {
        results: result.results.slice(0, 10).map((x) => ({
          title: x.title,
          url: x.url,
          content: x.content,
          engine: x.engine,
        })),
      };
    } else {
      return { error: `command "${cmd}" not found` };
    }
  }

  return { router };
}

export function countTokens(text: string) {
  return encode(text).length;
}

function createMessagesDump(messages: ChatMessage[]) {
  messages.sort((a, b) => +a.time - +b.time);
  const result: string[] = [];
  result.push(
    `Dumped ${messages.length} messages`,
  );
  for (const msg of messages) {
    result.push(`\n<div class='role-${msg.role}' id='${msg.id}'>\n`);
    result.push(
      `**${msg.role}** message time \`${
        new Date(+msg.time).toISOString()
      }\` id ${msg.id}${
        msg.replyTo ? ` reply [${msg.replyTo}](#${msg.replyTo})` : ""
      }`,
    );
    result.push("\n\t" + msg.content.split("\n").join("\n\t"));
    result.push("\n</div>\n");
  }
  return result.join("\n");
}
