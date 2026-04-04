import { mkdirSync, appendFileSync } from "fs";
import { resolve } from "path";

let logFilePath: string | null = null;

export function initLog(baseDir: string) {
  const logDir = resolve(baseDir, "logs");
  mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  logFilePath = resolve(logDir, `run-${timestamp}.log`);
}

export function log(message: string) {
  console.log(message);
  if (logFilePath) {
    appendFileSync(logFilePath, message + "\n", "utf-8");
  }
}

export function logRaw(message: string) {
  // Write to log file only (no console), for verbose tool output
  if (logFilePath) {
    appendFileSync(logFilePath, message + "\n", "utf-8");
  }
}

export function getLogPath(): string | null {
  return logFilePath;
}
