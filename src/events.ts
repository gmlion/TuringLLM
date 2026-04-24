import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

let logsDir: string | null = null;
let eventsPath: string | null = null;
let seqPath: string | null = null;
let nextSeq = 1;
let ctxCycle = 0;
let ctxFrame: string | null = null;

export function initEvents(baseDir: string): void {
  logsDir = resolve(baseDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  eventsPath = resolve(logsDir, "events.jsonl");
  seqPath = resolve(logsDir, ".events-seq");
  if (!existsSync(eventsPath)) writeFileSync(eventsPath, "", "utf-8");
  if (existsSync(seqPath)) {
    const v = parseInt(readFileSync(seqPath, "utf-8").trim(), 10);
    nextSeq = Number.isFinite(v) && v > 0 ? v : 1;
  } else {
    nextSeq = 1;
    writeFileSync(seqPath, "1", "utf-8");
  }
}

export function setCycleContext(cycle: number, frame: string | null): void {
  ctxCycle = cycle;
  ctxFrame = frame;
}

export function clearCycleContext(): void {
  ctxCycle = 0;
  ctxFrame = null;
}

function emit(type: string, fields: Record<string, unknown>): void {
  if (!eventsPath || !seqPath) throw new Error("events.ts: initEvents not called");
  const envelope = {
    seq: nextSeq,
    ts: new Date().toISOString(),
    cycle: ctxCycle,
    frame: ctxFrame,
    type,
    ...fields,
  };
  appendFileSync(eventsPath, JSON.stringify(envelope) + "\n", "utf-8");
  nextSeq += 1;
  writeFileSync(seqPath, String(nextSeq), "utf-8");
}

// Test-only export — production code uses the typed helpers added in T2/T3/T4.
export const _emitForTest = emit;
