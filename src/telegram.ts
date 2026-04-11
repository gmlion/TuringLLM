import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import type { UserSession } from "./main.js";
import { withBackoff } from "./main.js";

const API_BASE = "https://api.telegram.org/bot";

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

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

// Persisted state keyed by content hash
type PersistedState = {
  offset: number;
  // hash → telegram message ID
  sent: Record<string, number>;
  // hash → LLM question ID (e.g., "Q1")
  hashToLlmId: Record<string, string>;
};

export class TelegramSession implements UserSession {
  private token: string;
  private chatId: string;
  private instanceName: string;
  private statePath: string;
  private offset: number = 0;
  // hash → telegram message ID
  private sent: Map<string, number> = new Map();
  // hash → LLM question ID
  private hashToLlmId: Map<string, string> = new Map();
  // hash → answer text
  private answers: Map<string, string> = new Map();
  degraded: boolean = false;

  constructor(token: string, chatId: string, instanceName: string = "", instanceDir: string = ".") {
    this.token = token;
    this.chatId = chatId;
    this.instanceName = instanceName;
    this.statePath = `${instanceDir}/.telegram-state.json`;
    this.load();
  }

  private load(): void {
    try {
      const data = JSON.parse(readFileSync(this.statePath, "utf-8")) as PersistedState;
      this.offset = data.offset ?? 0;
      this.sent = new Map(Object.entries(data.sent ?? {}));
      this.hashToLlmId = new Map(Object.entries(data.hashToLlmId ?? {}));
    } catch {
      // No state file yet
    }
  }

  private save(): void {
    const data: PersistedState = {
      offset: this.offset,
      sent: Object.fromEntries(this.sent),
      hashToLlmId: Object.fromEntries(this.hashToLlmId),
    };
    writeFileSync(this.statePath, JSON.stringify(data), "utf-8");
  }

  async presentQuestion(id: string, question: string): Promise<void> {
    const hash = contentHash(question);
    if (this.sent.has(hash)) return; // exact same question already sent

    const prefix = this.instanceName ? `[${this.instanceName}] ` : "";
    try {
      const msgId = await withBackoff(
        () => sendTelegramMessage(this.token, this.chatId, `${prefix}${id}: ${question}`),
        { label: "telegram", maxRetries: 3, initialDelaySec: 5 }
      );
      this.sent.set(hash, msgId);
      this.hashToLlmId.set(hash, id);
      this.answers.delete(hash);
      this.save();
    } catch (err) {
      console.error(`  [telegram] Giving up on ${id}: ${err instanceof Error ? err.message : err}`);
      this.degraded = true;
    }
  }

  async sendInfo(text: string): Promise<void> {
    try {
      await sendTelegramMessage(this.token, this.chatId, text);
    } catch {
      // Non-critical
    }
  }

  wasPresented(_id: string, question: string): boolean {
    return this.sent.has(contentHash(question));
  }

  /** Get answers keyed by LLM question ID */
  getAnswers(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [hash, answer] of this.answers) {
      const llmId = this.hashToLlmId.get(hash);
      if (llmId) result.set(llmId, answer);
    }
    return result;
  }

  async collectReplies(): Promise<string[]> {
    try {
      const url = `${API_BASE}${this.token}/getUpdates?offset=${this.offset}&timeout=0`;
      const res = await fetch(url);
      const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
      if (!data.ok) {
        console.error(`  [telegram] getUpdates error: ${JSON.stringify(data)}`);
        return [];
      }

      const newLlmIds: string[] = [];
      for (const update of data.result) {
        this.offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || String(msg.chat.id) !== this.chatId || !msg.text) continue;
        if (!msg.reply_to_message) {
          console.error(`  [telegram] Ignoring non-reply message ${msg.message_id}: "${msg.text?.slice(0, 50)}"`);
          continue;
        }

        // Find which hash this reply belongs to
        let matched = false;
        for (const [hash, sentMsgId] of this.sent) {
          if (msg.reply_to_message.message_id === sentMsgId && !this.answers.has(hash)) {
            this.answers.set(hash, msg.text);
            const llmId = this.hashToLlmId.get(hash);
            if (llmId) newLlmIds.push(llmId);
            matched = true;
            break;
          }
        }
        if (!matched) {
          console.error(`  [telegram] Reply to msg ${msg.reply_to_message.message_id} didn't match any sent question`);
        }
      }

      if (newLlmIds.length > 0 || data.result.length > 0) this.save();
      return newLlmIds;
    } catch (err) {
      console.error(`  [telegram] Poll failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  async waitForAny(pollIntervalMs: number = 3000): Promise<string[]> {
    while (true) {
      const newIds = await this.collectReplies();
      if (this.degraded || newIds.length > 0) return newIds;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }
}
