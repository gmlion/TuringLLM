/**
 * question-router.ts — Maps each pending question's id to the frame that
 * asked it, so an answer arriving asynchronously is routed back to the
 * asking frame's MEMORY rather than to whichever frame happens to be
 * active when the answer arrives.
 *
 * Without this routing, in a recursive call stack the asker (e.g. a
 * planner) is dormant while child frames execute; the answer would land
 * in some unrelated child's MEMORY, breaking the question/answer
 * contract.
 *
 * Persisted to `.question-router.json` at the instance root so the
 * mapping survives restart. Orphaned answers (asker popped before
 * answer arrived) are appended to `orphaned-answers.md` at the
 * instance root and removed from the live map.
 */
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { BASE_DIR } from "./config.js";

type RouterState = { questions: Record<string, string> };

export class QuestionRouter {
  private state: RouterState = { questions: {} };
  private statePath: string;
  private orphanPath: string;

  constructor(instanceDir: string) {
    this.statePath = resolve(instanceDir, ".question-router.json");
    this.orphanPath = resolve(instanceDir, "orphaned-answers.md");
    this.load();
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf-8"));
      if (parsed && typeof parsed === "object" && parsed.questions) {
        this.state = { questions: { ...parsed.questions } };
      }
    } catch {
      // Missing or malformed: start empty.
    }
  }

  private save(): void {
    writeFileSync(this.statePath, JSON.stringify(this.state), "utf-8");
  }

  /** Record that frameDir asked question qid. Idempotent. */
  recordAsker(qid: string, frameDir: string): void {
    if (this.state.questions[qid] === frameDir) return;
    this.state.questions[qid] = frameDir;
    this.save();
  }

  /** Look up the frame that asked qid, or null if unknown. */
  frameForQuestion(qid: string): string | null {
    return this.state.questions[qid] ?? null;
  }

  /** Forget a question after its answer has been delivered or orphaned. */
  forget(qid: string): void {
    if (!(qid in this.state.questions)) return;
    delete this.state.questions[qid];
    this.save();
  }

  /**
   * Append an orphaned answer to the per-instance side file. An orphan
   * is an answer whose asking frame has already been popped (its
   * directory is gone) — the user replied but there's no live frame to
   * receive the answer.
   */
  recordOrphan(qid: string, answer: string, askerFrameDir: string | null): void {
    const stamp = new Date().toISOString();
    const askerLine = askerFrameDir ? ` (asker frame: \`${askerFrameDir}\`)` : "";
    const block = `\n## ${qid}${askerLine}\n_${stamp}_\n\n${answer}\n`;
    appendFileSync(this.orphanPath, block, "utf-8");
  }
}

let _router: QuestionRouter | null = null;

/**
 * Lazy singleton. Instantiates against the current BASE_DIR on first
 * access — same pattern as userSession() in session.ts.
 */
export function questionRouter(): QuestionRouter {
  if (!_router) _router = new QuestionRouter(BASE_DIR);
  return _router;
}

/** Test-only: drop the singleton so the next questionRouter() call rebuilds against BASE_DIR. */
export function _resetQuestionRouter(): void {
  _router = null;
}
