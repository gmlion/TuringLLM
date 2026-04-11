import type { UserSession } from "./main.js";
import { withBackoff } from "./main.js";

const API_BASE = "https://api.telegram.org/bot";

async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<number> {
  const res = await fetch(`${API_BASE}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  if (!data.ok || !data.result) {
    throw new Error(`sendMessage failed: ${JSON.stringify(data)}`);
  }
  return data.result.message_id;
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    reply_to_message?: { message_id: number };
  };
};

export class TelegramSession implements UserSession {
  private token: string;
  private chatId: string;
  private instanceName: string;
  private offset: number = 0;
  private sentQuestions: Map<string, number> = new Map();
  private answers: Map<string, string> = new Map();
  degraded: boolean = false;

  constructor(token: string, chatId: string, instanceName: string = "") {
    this.token = token;
    this.chatId = chatId;
    this.instanceName = instanceName;
  }

  async presentQuestion(id: string, question: string): Promise<void> {
    const prefix = this.instanceName ? `[${this.instanceName}] ` : "";
    try {
      const msgId = await withBackoff(
        () => sendTelegramMessage(this.token, this.chatId, `${prefix}${id}: ${question}`),
        { label: "telegram", maxRetries: 3, initialDelaySec: 5 }
      );
      this.sentQuestions.set(id, msgId);
    } catch (err) {
      console.error(`  [telegram] Giving up on ${id}: ${err instanceof Error ? err.message : err}`);
      this.degraded = true;
    }
  }

  wasPresented(id: string): boolean {
    return this.sentQuestions.has(id);
  }

  getAnswers(): Map<string, string> {
    return new Map(this.answers);
  }

  async collectReplies(): Promise<string[]> {
    let updates: TelegramUpdate[];
    try {
      const result = await withBackoff(
        async () => {
          const res = await fetch(`${API_BASE}${this.token}/getUpdates?offset=${this.offset}&timeout=0`);
          const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
          if (!data.ok) throw new Error(`getUpdates failed: ${JSON.stringify(data)}`);
          return data.result;
        },
        { label: "telegram", maxRetries: 3, initialDelaySec: 5 }
      );
      updates = result;
    } catch (err) {
      console.error(`  [telegram] Poll giving up: ${err instanceof Error ? err.message : err}`);
      return [];
    }

    const newAnswers: string[] = [];
    for (const update of updates) {
      this.offset = update.update_id + 1;
      const msg = update.message;
      if (!msg || String(msg.chat.id) !== this.chatId || !msg.text) continue;
      if (!msg.reply_to_message) continue;
      for (const [qId, sentMsgId] of this.sentQuestions) {
        if (msg.reply_to_message.message_id === sentMsgId && !this.answers.has(qId)) {
          this.answers.set(qId, msg.text);
          newAnswers.push(qId);
          break;
        }
      }
    }
    return newAnswers;
  }

  async waitForAll(ids: string[], pollIntervalMs: number = 3000): Promise<void> {
    while (true) {
      await this.collectReplies();
      if (this.degraded) return;
      if (ids.every((id) => this.answers.has(id))) return;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }
}
