import { CONTEXT_TOKEN_LIMIT, countTokens, Message } from "./ai.ts";
import { Database, getDatabase, IDbDocSet } from "../../utils/db.ts";

export interface ChatState {
  id: string;
  type: string;
  name?: string;
  lastMessageId?: string;
  settings: {
    systemPrompt?: string;
    params?: {
      temp?: number;
      top_p?: number;
    };
  };
  requestCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
}

export interface ChatMessage {
  id: string;
  chat: string;
  time: string;
  replyTo: string | undefined;
  role: Message["role"];
  content: string;
  tokens: number;
}

export class ChatStore {
  async init(id: string) {
    this.db = await getDatabase(id, "ai");
    this.chats = await this.db.createSet<ChatState>("chats", "doc");
    this.msgs = await this.db.createSet<ChatMessage>("msgs", "doc");
    await this.msgs.useIndexes({
      chat: (msg) => msg.chat,
    });
    await this.db.commit();
  }

  db!: Database;
  chats!: IDbDocSet<ChatState>;
  msgs!: IDbDocSet<ChatMessage>;
  objMap = new Map<string, ChatState>();

  async getChat(id: string, type: string): Promise<ChatState> {
    let chat = this.objMap.get(id) ?? await this.chats.get(id);
    if (!chat) {
      chat = { id, type, messages: [] } as any;
      await this.chats.insert(chat);
    }
    await this.migrateChat(chat);
    this.objMap.set(id, chat);
    return chat;
  }

  async getMessagesByChatId(chatId: string) {
    return await this.msgs.findIndex("chat", chatId);
  }

  async updateChat(chat: ChatState) {
    await this.db.runTransaction(async () => {
      await this.chats.update(chat);
    });
  }

  async getMessage(msgId: string) {
    const msg = await this.msgs.get(msgId);
    if (!msg) return null;
    if (msg.tokens === undefined) {
      msg.tokens = countTokens(msg.content);
      this.putMessage(msg); // no await
    }
    return msg;
  }

  async getMessageChain(msgId: string, maxTokens: number) {
    let lastId = msgId as string | undefined;
    const result = [];
    let tokens = 0;
    while (lastId) {
      const msg = await this.getMessage(lastId);
      if (!msg) break;
      if (result.length && tokens + msg.tokens > maxTokens) break;
      tokens += msg.tokens;
      result.push(msg);
      lastId = msg.replyTo;
    }
    return result.reverse();
  }

  async putMessage(...msgs: ChatMessage[]) {
    await this.db.runTransaction(async () => {
      for (const msg of msgs) {
        await this.msgs.upsert(msg);
      }
    });
  }

  async deleteMessages(ids: string[]) {
    await this.db.runTransaction(async () => {
      for (const id of ids) {
        await this.msgs.delete(id);
      }
    });
  }

  private async migrateChat(chat: ChatState) {
    let migrated = false;
    if (!chat.settings) {
      chat.settings = {};
      migrated = true;
    }
    if (chat.requestCount === undefined || isNaN(chat.outputTokenCount)) {
      chat.requestCount = 0;
      chat.inputTokenCount = 0;
      chat.outputTokenCount = 0;
      const msgs = await this.getMessagesByChatId(chat.id);
      for (const msg of msgs) {
        if (msg.role === "assistant") {
          chat.requestCount += 1;
          chat.outputTokenCount += msg.tokens ?? countTokens(msg.content);
          if (msg.replyTo) {
            chat.inputTokenCount +=
              (await this.getMessageChain(msg.replyTo, CONTEXT_TOKEN_LIMIT))
                .reduce((prev, x) => prev + x.tokens, 0);
          }
        }
      }
      migrated = true;
    }
    if ("messages" in chat) {
      delete chat.messages;
      migrated = true;
    }
    if (migrated) {
      await this.updateChat(chat);
    }
  }
}
