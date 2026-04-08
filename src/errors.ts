export class QuotaExceededError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "QuotaExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
