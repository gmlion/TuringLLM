/**
 * interaction.ts — User-question presentation and answer collection.
 *
 * The shell side of the question/answer flow: take pending questions out
 * of MEMORY, route them through the user session, and write returned
 * answers back. The session itself (stdin vs Telegram routing) lives in
 * session.ts; this module does the disk-side wiring.
 *
 * Per-frame routing: each pending question is recorded against the frame
 * whose MEMORY it appears in. When the answer arrives — possibly several
 * cycles later, when a different frame is active — the answer is written
 * back to the asking frame's MEMORY rather than to whichever frame is
 * currently on top. If the asker has been popped before the answer
 * arrives, the answer is appended to `orphaned-answers.md` at the
 * instance root. See question-router.ts for the persisted mapping.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { log } from "./logger.js";
import { userSession } from "./session.js";
import { questionRouter, QuestionRouter } from "./question-router.js";
import { BASE_DIR, USE_TELEGRAM, INSTANCE_NAME, activeFramePaths } from "./config.js";
import { getAnswersSection, writeAnswer, setState } from "./memory.js";
import { readFile, getPendingQuestions } from "./io.js";
import type { CallStack } from "./call-stack.js";

export async function sendCycleSummary(
  cycle: number,
  summary: string | undefined,
  memoryPath: string,
): Promise<void> {
  if (!summary) return;
  if (getPendingQuestions(memoryPath).length === 0) return;
  await userSession().sendInfoIfActive(`[${INSTANCE_NAME}] Cycle ${cycle}\n\n${summary}`);
}

/**
 * Present any not-yet-presented questions found in `memoryPath`, and
 * record each one's asker (the relative `frameDir` of the frame that
 * wrote them) so the eventual answer can be routed back.
 */
export async function presentNewQuestions(
  memoryPath: string,
  frameDir: string,
): Promise<void> {
  for (const q of getPendingQuestions(memoryPath)) {
    if (!userSession().wasPresented(q.id, q.question)) {
      questionRouter().recordAsker(q.id, frameDir);
      if (USE_TELEGRAM) log(`  [telegram] Sending ${q.id}: ${q.question}`);
      await userSession().presentQuestion(q.id, q.question);
    }
  }
}

function applyAnswers(
  memory: string,
  newIds: string[],
  answers: Map<string, string>,
): { memory: string; wrote: boolean } {
  const existing = getAnswersSection(memory);
  let wrote = false;
  for (const qId of newIds) {
    const answer = answers.get(qId);
    if (!answer || existing.includes(`- **${qId}**:`)) continue;
    log(`  [${qId} answered] ${answer}`);
    memory = writeAnswer(memory, qId, answer);
    wrote = true;
  }
  return { memory, wrote };
}

/**
 * Pure planner: given the freshly-arrived qids, the in-session answer
 * map, the live stack's relative frameDirs, and the router, decide
 * which answers go to which frame's MEMORY and which are orphans.
 * No I/O — kept pure so the routing rule can be unit-tested without
 * touching the session or filesystem.
 */
export function planAnswerRouting(
  newIds: string[],
  answers: Map<string, string>,
  liveFrameDirs: Set<string>,
  router: QuestionRouter,
): {
  routed: Map<string, Array<{ qid: string; answer: string }>>;
  orphans: Array<{ qid: string; answer: string; asker: string | null }>;
} {
  const routed = new Map<string, Array<{ qid: string; answer: string }>>();
  const orphans: Array<{ qid: string; answer: string; asker: string | null }> = [];
  for (const qid of newIds) {
    const answer = answers.get(qid);
    if (!answer) continue;
    const asker = router.frameForQuestion(qid);
    if (!asker || !liveFrameDirs.has(asker)) {
      orphans.push({ qid, answer, asker });
      continue;
    }
    if (!routed.has(asker)) routed.set(asker, []);
    routed.get(asker)!.push({ qid, answer });
  }
  return { routed, orphans };
}

/**
 * Non-blocking answer collection. Polls the user session, then for each
 * newly-arrived answer looks up the asking frame in the router and
 * writes the answer to that frame's MEMORY. Answers whose asker has
 * been popped (no longer on the live stack) are appended to
 * `orphaned-answers.md` and removed from the router.
 */
export async function collectReplies(callStack: CallStack): Promise<void> {
  const newIds = await userSession().collectReplies();
  if (newIds.length === 0) return;

  const router = questionRouter();
  const liveFrames = new Set(callStack.stack.map((f) => f.frameDir));
  const { routed, orphans } = planAnswerRouting(
    newIds,
    userSession().getAnswers(),
    liveFrames,
    router,
  );

  for (const { qid, answer, asker } of orphans) {
    router.recordOrphan(qid, answer, asker);
    router.forget(qid);
    log(`  [orphan] Q ${qid} answered but asker is gone — appended to orphaned-answers.md`);
  }

  for (const [askerFrame, items] of routed) {
    const askerMemoryPath = resolve(BASE_DIR, askerFrame, "MEMORY.md");
    const ids = items.map((i) => i.qid);
    const flatAnswers = new Map(items.map((i) => [i.qid, i.answer] as const));
    const { memory, wrote } = applyAnswers(readFile(askerMemoryPath), ids, flatAnswers);
    if (wrote) writeFileSync(askerMemoryPath, memory, "utf-8");
    for (const { qid } of items) router.forget(qid);
  }
}

/**
 * Blocking interaction: the active frame's state is `waiting_for_user`,
 * so it has decided it cannot proceed without an answer. We present any
 * remaining questions, wait for any reply, write the answer to the
 * active frame's MEMORY, and set its state to `user_responded`.
 *
 * The active frame is the asker in this path: if it weren't, it would
 * not be the one blocking. Routing via the router would resolve to the
 * same memory file, so we keep the simpler direct write here.
 */
export async function handleUserInteraction(
  memoryPath: string,
  frameDir: string,
): Promise<void> {
  await presentNewQuestions(memoryPath, frameDir);

  const questions = getPendingQuestions(memoryPath);
  if (questions.length === 0) {
    questionRouter().recordAsker("Q0", frameDir);
    await userSession().presentQuestion("Q0", "(the machine is asking for input but provided no question)");
  }

  const ids = questions.length > 0 ? questions.map((q) => q.id) : ["Q0"];
  log(`  Waiting for any reply to: ${ids.join(", ")}...`);
  const newIds = await userSession().waitForAny();

  const { memory } = applyAnswers(readFile(memoryPath), newIds, userSession().getAnswers());
  writeFileSync(memoryPath, setState(memory, "user_responded"), "utf-8");
  for (const qid of newIds) questionRouter().forget(qid);
}

export async function postCycleUserOps(
  cycle: number,
  summary: string | undefined,
  callStack: CallStack,
  finalState: string,
): Promise<void> {
  const { memoryPath } = activeFramePaths(callStack);
  const frameDir = callStack.stack[callStack.stack.length - 1].frameDir;
  await sendCycleSummary(cycle, summary, memoryPath);
  await presentNewQuestions(memoryPath, frameDir);
  if (finalState === "waiting_for_user") await handleUserInteraction(memoryPath, frameDir);
}
