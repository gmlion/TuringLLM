/**
 * interaction.ts — User-question presentation and answer collection.
 *
 * The shell side of the question/answer flow: take pending questions out
 * of MEMORY, route them through the user session, and write returned
 * answers back. The session itself (stdin vs Telegram routing) lives in
 * session.ts; this module does the disk-side wiring.
 */

import { writeFileSync } from "fs";
import { log } from "./logger.js";
import { userSession } from "./session.js";
import { USE_TELEGRAM, INSTANCE_NAME } from "./config.js";
import { getAnswersSection, writeAnswer, setState } from "./memory.js";
import { readFile, getPendingQuestions } from "./io.js";

export async function sendCycleSummary(
  cycle: number,
  summary: string | undefined,
  memoryPath: string,
): Promise<void> {
  if (!summary) return;
  if (getPendingQuestions(memoryPath).length === 0) return;
  await userSession().sendInfoIfActive(`[${INSTANCE_NAME}] Cycle ${cycle}\n\n${summary}`);
}

export async function presentNewQuestions(memoryPath: string): Promise<void> {
  for (const q of getPendingQuestions(memoryPath)) {
    if (!userSession().wasPresented(q.id, q.question)) {
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

export async function collectReplies(memoryPath: string): Promise<void> {
  const newIds = await userSession().collectReplies();
  if (newIds.length === 0) return;
  const { memory, wrote } = applyAnswers(readFile(memoryPath), newIds, userSession().getAnswers());
  if (wrote) writeFileSync(memoryPath, memory, "utf-8");
}

export async function handleUserInteraction(memoryPath: string): Promise<void> {
  await presentNewQuestions(memoryPath);

  const questions = getPendingQuestions(memoryPath);
  if (questions.length === 0) {
    await userSession().presentQuestion("Q0", "(the machine is asking for input but provided no question)");
  }

  const ids = questions.length > 0 ? questions.map((q) => q.id) : ["Q0"];
  log(`  Waiting for any reply to: ${ids.join(", ")}...`);
  const newIds = await userSession().waitForAny();

  const { memory } = applyAnswers(readFile(memoryPath), newIds, userSession().getAnswers());
  writeFileSync(memoryPath, setState(memory, "user_responded"), "utf-8");
}

export async function postCycleUserOps(
  cycle: number,
  summary: string | undefined,
  memoryPath: string,
  finalState: string,
): Promise<void> {
  await sendCycleSummary(cycle, summary, memoryPath);
  await presentNewQuestions(memoryPath);
  if (finalState === "waiting_for_user") await handleUserInteraction(memoryPath);
}
