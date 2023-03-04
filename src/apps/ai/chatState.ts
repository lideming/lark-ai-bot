import { Message } from "./ai.ts";
import { Database, IDbDocSet } from "https://deno.land/x/btrdb@v0.8.3/mod.ts";
import { getDatabase } from "../../utils/db.ts";

export interface ChatState {
  id: string;
  type: string;
  name?: string;
  messages: Message[];
  settings: {
    systemPrompt?: string;
  };
}

export class ChatStore {
  async init(id: string) {
    this.db = await getDatabase(id, "ai");
    this.chats = await this.db.createSet<ChatState>("chats", "doc");
    await this.db.commit();
  }

  db!: Database;
  chats!: IDbDocSet<ChatState>;
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
    this.objMap.set(id, chat);
    while (chat.messages.length > 10) {
      chat.messages.shift();
    }
    return chat;
  }

  async updateChat(chat: ChatState) {
    await this.db.runTransaction(async () => {
      await this.chats.update(chat);
    });
  }
}
