import { countTokens, Message } from "./ai.ts";
import { Database, IDbDocSet } from "https://deno.land/x/btrdb@v0.8.3/mod.ts";
import { getDatabase } from "../../utils/db.ts";

export interface ChatState {
  id: string;
  type: string;
  name?: string;
  lastMessageId?: string;
  settings: {
    systemPrompt?: string;
  };
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
    if (!chat.settings) {
      chat.settings = {};
    }
    if ("messages" in chat) {
      delete chat.messages;
    }
    this.objMap.set(id, chat);
    return chat;
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
      if (tokens + msg.tokens > maxTokens) break;
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
}
