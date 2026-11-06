// Sending messages from the bot (used by the webhook replies and by scheduled reminders).
// `keyboard` = rows of button labels shown under the typing box (a "reply keyboard"), or undefined.
export async function sendTelegram(chatId, text, keyboard) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { keyboard: keyboard.map((row) => row.map((label) => ({ text: label }))), resize_keyboard: true, is_persistent: true } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.description || `Telegram ${res.status}`);
}
