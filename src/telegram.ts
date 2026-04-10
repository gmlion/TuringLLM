const API_BASE = "https://api.telegram.org/bot";

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<number> {
  const res = await fetch(`${API_BASE}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  if (!data.ok || !data.result) {
    throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
  }
  return data.result.message_id;
}

export async function waitForTelegramReply(
  token: string,
  chatId: string,
  afterMessageId: number,
  pollIntervalMs: number = 3000
): Promise<string> {
  let offset = 0;
  while (true) {
    const url = `${API_BASE}${token}/getUpdates?offset=${offset}&timeout=30`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: { message_id: number; chat: { id: number }; text?: string };
      }>;
    };

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        if (
          update.message &&
          String(update.message.chat.id) === chatId &&
          update.message.message_id > afterMessageId &&
          update.message.text
        ) {
          return update.message.text;
        }
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}
