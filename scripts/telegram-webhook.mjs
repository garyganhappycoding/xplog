// One-time setup: points your Telegram bot at the deployed XPLog and adds the "/" command menu.
//
//   npm run telegram:webhook -- https://your-app.vercel.app
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local (via --env-file).
const base = (process.argv[2] || "").replace(/\/+$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!/^https:\/\//.test(base) || !token || !secret) {
  console.error("Usage: npm run telegram:webhook -- https://your-app.vercel.app");
  console.error("Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local, and an https URL.");
  process.exit(1);
}

const api = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
};

await api("setWebhook", {
  url: `${base}/api/telegram`,
  secret_token: secret,
  allowed_updates: ["message"],
  drop_pending_updates: true,
});
await api("setMyCommands", {
  commands: [
    { command: "todo", description: "添加待办(一行一个)" },
    { command: "entry", description: "记一条日记" },
    { command: "idea", description: "记一个想法(同步到 Notion)" },
    { command: "event", description: "添加日程(时间/地点/准备)" },
    { command: "help", description: "查看用法" },
  ],
});

const info = await api("getWebhookInfo");
console.log("Webhook set:", info.url);
if (info.last_error_message) console.log("Last error:", info.last_error_message);
console.log("Done. Send /help to your bot in Telegram.");
