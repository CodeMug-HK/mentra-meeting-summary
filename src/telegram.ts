const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Not configured, skipping notification");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Telegram] Failed to send: ${res.status} ${err}`);
  }
}

export async function sendTelegramPhoto(
  photoBuffer: Buffer,
  filename: string,
  caption: string,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Not configured, skipping photo");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("photo", new Blob([new Uint8Array(photoBuffer)]), filename);
  // Telegram caption max is 1024 chars
  formData.append("caption", caption.slice(0, 1024));

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Telegram] Failed to send photo: ${res.status} ${err}`);
    // Fallback: send as text message if photo fails
    await sendTelegramMessage(`🀄 *Mahjong Analysis*\n\n${caption}`);
  }
}
