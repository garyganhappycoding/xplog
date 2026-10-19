import { createStore, resolveOwnerUid, adminSdkStatus } from "@/lib/server/firebaseAdmin";
import { handleMessage } from "@/lib/telegram/handlers";
import { defaultLlm } from "@/lib/telegram/llm";
import { defaultMemory } from "@/lib/telegram/memoryService";
import { groqStatus } from "@/lib/server/groq";
import { sendTelegram } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

// Replies must never make the webhook fail (Telegram would retry the message).
const sendMessage = (chatId, text) => sendTelegram(chatId, text).catch(() => {});

// Downloads the largest size of a photo message (the bot token never leaves the server).
async function downloadPhoto(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
  if (!info.ok) throw new Error(info.description || "getFile failed");
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
  if (!res.ok) throw new Error("download failed");
  const ext = (info.result.file_path.split(".").pop() || "jpg").toLowerCase();
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
    filename: `telegram-${Date.now()}.${ext}`,
  };
}

// Telegram calls this for every message sent to the bot (registered with setWebhook, see
// scripts/telegram-webhook.mjs). Always answer 200 once the request is authentic - a non-200
// makes Telegram retry the same message over and over.
export async function POST(req) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.chat) return Response.json({ ok: true });

  const chatId = String(msg.chat.id);
  const allowed = process.env.TELEGRAM_ALLOWED_CHAT_ID;

  if (!allowed) {
    // First-run helper: tell the owner which id to put in TELEGRAM_ALLOWED_CHAT_ID.
    await sendMessage(chatId, `你好!这个机器人还没绑定账号。\n你的 chat id 是:${chatId}\n把它填到 Vercel 环境变量 TELEGRAM_ALLOWED_CHAT_ID,重新部署后再发消息就能用了。`);
    return Response.json({ ok: true });
  }
  if (chatId !== String(allowed)) {
    await sendMessage(chatId, "这是私人机器人 🔒");
    return Response.json({ ok: true });
  }
  const text = msg.text ?? msg.caption ?? "";
  if (!text && !msg.photo?.length) {
    await sendMessage(chatId, "目前只支持文字和照片。发 /help 看用法。");
    return Response.json({ ok: true });
  }

  let reply;
  try {
    const store = await createStore(await resolveOwnerUid());
    if (!(await store.claimUpdate(update.update_id))) return Response.json({ ok: true, duplicate: true });
    // The photo is only downloaded if it is actually saved (nothing is saved to Notion unless asked).
    const photo = msg.photo?.length ? { fileId: msg.photo[msg.photo.length - 1].file_id } : null;
    reply = await handleMessage({ store, llm: defaultLlm, memory: defaultMemory, text, photo, loadPhoto: downloadPhoto, ref: `tg:${update.update_id}` });
  } catch (e) {
    console.error("telegram webhook failed", e);
    reply = `⚠️ 没有记录成功:${e.message || "未知错误"}`;
  }
  await sendMessage(chatId, reply);
  return Response.json({ ok: true });
}

// A browser visit shows whether the endpoint is deployed (it never reveals secrets).
export async function GET() {
  return Response.json({
    ok: true,
    firebaseAdminSdk: await adminSdkStatus(),
    groqCheck: await groqStatus(),
    configured: {
      botToken: !!process.env.TELEGRAM_BOT_TOKEN,
      webhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      allowedChatId: !!process.env.TELEGRAM_ALLOWED_CHAT_ID,
      firebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      owner: !!(process.env.XPLOG_OWNER_UID || process.env.XPLOG_OWNER_EMAIL),
      groq: !!process.env.GROQ_API_KEY,
      notion: !!(process.env.NOTION_API_KEY && process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID),
    },
  });
}
