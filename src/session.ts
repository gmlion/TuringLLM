/**
 * session.ts — User-session abstraction.
 *
 * Two concrete sessions exist: stdin (always available) and Telegram
 * (configured via env). RoutedSession routes interaction calls to whichever
 * is active, falling back from Telegram to stdin if Telegram degrades, and
 * merges answers from both so nothing collected is lost across a fallback.
 *
 * Stdin readline and the Telegram client are created lazily — eager
 * creation at import time would capture the TTY and break the test suite.
 */

import { createInterface } from "readline";
import { log } from "./logger.js";
import { TelegramSession } from "./telegram.js";
import {
  USE_TELEGRAM, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
  INSTANCE_NAME, BASE_DIR,
} from "./config.js";

export interface UserSession {
  presentQuestion(id: string, question: string): Promise<void>;
  wasPresented(id: string, question: string): boolean;
  collectReplies(): Promise<string[]>;
  waitForAny(pollIntervalMs?: number): Promise<string[]>;
  getAnswers(): Map<string, string>;
}

/**
 * Pure state machine layer: tracks question presentation and answer collection.
 * No I/O side-effects; separate from readline mechanics.
 */
class StdinStateManager {
  private presented = new Set<string>();
  private answers = new Map<string, string>();
  private pendingQueue: string[] = [];
  private previouslyCollected = new Set<string>();

  presentQuestion(id: string): void {
    this.presented.add(id);
    this.pendingQueue.push(id);
  }

  wasPresented(id: string): boolean {
    return this.presented.has(id);
  }

  // Find next unanswered question without side-effects.
  nextUnanswered(): string | undefined {
    return this.pendingQueue.find((id) => !this.answers.has(id));
  }

  recordAnswer(id: string, answer: string): void {
    this.answers.set(id, answer);
  }

  collectNewReplies(): string[] {
    const newIds = [...this.presented].filter(
      (id) => this.answers.has(id) && !this.previouslyCollected.has(id)
    );
    for (const id of newIds) this.previouslyCollected.add(id);
    return newIds;
  }

  getAnswers(): Map<string, string> {
    return new Map(this.answers);
  }
}

/**
 * Thin I/O handler: readline interface and user interaction.
 * Delegates state management to the pure state machine layer.
 */
class StdinSession implements UserSession {
  private state = new StdinStateManager();
  private rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  private listening = false;

  async presentQuestion(id: string, question: string): Promise<void> {
    this.state.presentQuestion(id);
    log("");
    log(`┌─ ${id} ${"─".repeat(Math.max(0, 50 - id.length))}┐`);
    for (const line of question.split("\n")) log(`│ ${line}`);
    log(`└${"─".repeat(54)}┘`);
    this.promptNext();
  }

  wasPresented(id: string, _question: string): boolean {
    return this.state.wasPresented(id);
  }

  private promptNext(): void {
    this.drainQueue();
  }

  private drainQueue(): void {
    const nextId = this.state.nextUnanswered();
    if (!nextId) {
      this.listening = false;
      return;
    }
    if (this.listening) return;
    this.listening = true;
    process.stdout.write(`  ${nextId} > `);
    this.rl.once("line", (answer) => {
      this.listening = false;
      this.state.recordAnswer(nextId, answer);
      // I/O handler invokes state machine again to drain next item.
      setImmediate(() => this.drainQueue());
    });
  }

  async collectReplies(): Promise<string[]> {
    return this.state.collectNewReplies();
  }

  async waitForAny(): Promise<string[]> {
    this.promptNext();
    while (true) {
      const newIds = await this.collectReplies();
      if (newIds.length > 0) return newIds;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  getAnswers(): Map<string, string> {
    return this.state.getAnswers();
  }
}

export class RoutedSession implements UserSession {
  private telegram: TelegramSession | null;
  private stdin: StdinSession | null = null;
  private degradedNoticeLogged = false;

  constructor() {
    this.telegram = USE_TELEGRAM
      ? new TelegramSession(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, INSTANCE_NAME, BASE_DIR)
      : null;
  }

  private active(): UserSession {
    if (this.telegram && !this.telegram.degraded) return this.telegram;
    if (this.telegram?.degraded && !this.degradedNoticeLogged) {
      log("  [telegram] Degraded — falling back to stdin");
      this.degradedNoticeLogged = true;
    }
    if (!this.stdin) this.stdin = new StdinSession();
    return this.stdin;
  }

  presentQuestion(id: string, q: string): Promise<void> { return this.active().presentQuestion(id, q); }
  wasPresented(id: string, q: string): boolean { return this.active().wasPresented(id, q); }
  collectReplies(): Promise<string[]> { return this.active().collectReplies(); }
  waitForAny(p?: number): Promise<string[]> { return this.active().waitForAny(p); }

  getAnswers(): Map<string, string> {
    // Merge answers from all active sessions using reduce/fold.
    // Sessions are merged in order: telegram first, then stdin.
    // On key collision, later sessions' values override earlier ones (stdin wins over telegram).
    // This fold makes the merge semantics and precedence testable and explicit.
    const sessions = [
      ...(this.telegram ? [this.telegram.getAnswers()] : []),
      ...(this.stdin ? [this.stdin.getAnswers()] : []),
    ];

    return sessions.reduce(
      (merged, sessionAnswers) => {
        for (const [k, v] of sessionAnswers) merged.set(k, v);
        return merged;
      },
      new Map<string, string>()
    );
  }

  // Telegram-specific side-channel notification: sends a fire-and-forget
  // info message when Telegram is configured and not degraded. No-op
  // otherwise. Stdin has no equivalent.
  async sendInfoIfActive(message: string): Promise<void> {
    if (this.telegram && !this.telegram.degraded) {
      await this.telegram.sendInfo(message);
    }
  }
}

let _userSession: RoutedSession | null = null;
export function userSession(): RoutedSession {
  if (!_userSession) _userSession = new RoutedSession();
  return _userSession;
}
