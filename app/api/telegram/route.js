import { createStore, resolveOwnerUid, adminSdkStatus } from "@/lib/server/firebaseAdmin";
import { handleMessageRich } from "@/lib/telegram/handlers";
import { MAIN_KEYBOARD } from "@/lib/telegram/menu";
import { defaultLlm } from "@/lib/telegram/llm";
import { defaultMemory } from "@/lib/telegram/memoryService";
import { groqStatus, groqToolsCheck, groqChat, hasGroq, transcribeAudio } from "@/lib/server/groq";
import { downloadTelegramFile } from "@/lib/server/telegramFiles";
import { runAgent } from "@/lib/telegram/agent";
import { hasWebSearch, webSearch } from "@/lib/server/web";
import { planQuery, retrieveNotes } from "@/lib/server/rag";
import { sendTelegram } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

// Replies must never make the webhook fail (Telegram would retry the message).
const sendMessage = (chatId, text, keyboard) => sendTelegram(chatId, text, keyboard).catch(() => {});

// The conversational assistant (needs the AI key). It reads your notes (Notion) but never writes to Notion.
function makeAgent() {
  if (!hasGroq()) return undefined;
  return (args) =>
    runAgent({
      ...args,
      chat: groqChat,
      webSearch: hasWebSearch() ? webSearch : undefined,
      searchNotes: async (query) => retrieveNotes((await planQuery(query)).keywords),
    });
}

// Voice notes -> text (Whisper on Groq).
async function transcribe(file) {
  if (!hasGroq()) throw new Error("没有配置 GROQ_API_KEY");
  return transcribeAudio(file.buffer, file.mime, file.filename);
}

// Page titles for links dropped into the box (best effort, 3 seconds at most).
const llmWithTitles = {
  ...defaultLlm,
  async fetchTitle(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { "User-Agent": "Mozilla/5.0 XPLog" } });
    const html = (await res.text()).slice(0, 60000);
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 140) : null;
  },
};

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
  const audio = msg.voice || msg.audio || msg.video_note || null;
  if (!text && !msg.photo?.length && !audio) {
    await sendMessage(chatId, "目前支持文字、链接、照片和语音。点下面的按钮看看我能做什么 👇", MAIN_KEYBOARD);
    return Response.json({ ok: true });
  }

  let reply;
  try {
    const store = await createStore(await resolveOwnerUid());
    if (!(await store.claimUpdate(update.update_id))) return Response.json({ ok: true, duplicate: true });
    // Photos and voice notes go to the dump box; only the voice note is downloaded here (to transcribe it).
    const photo = msg.photo?.length ? { fileId: msg.photo[msg.photo.length - 1].file_id } : null;
    const voice = audio ? { fileId: audio.file_id, duration: audio.duration || 0 } : null;
    reply = await handleMessageRich({ store, llm: llmWithTitles, memory: defaultMemory, agent: makeAgent(), text, photo, voice, loadFile: downloadTelegramFile, transcribe });
  } catch (e) {
    console.error("telegram webhook failed", e);
    reply = { text: `⚠️ 没有记录成功:${e.message || "未知错误"}`, keyboard: MAIN_KEYBOARD };
  }
  await sendMessage(chatId, reply.text, reply.keyboard);
  return Response.json({ ok: true });
}

// A browser visit shows whether the endpoint is deployed (it never reveals secrets).
export async function GET() {
  return Response.json({
    ok: true,
    firebaseAdminSdk: await adminSdkStatus(),
    groqCheck: await groqStatus(),
    toolCalling: await groqToolsCheck(),
    configured: {
      botToken: !!process.env.TELEGRAM_BOT_TOKEN,
      webhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      allowedChatId: !!process.env.TELEGRAM_ALLOWED_CHAT_ID,
      firebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      owner: !!(process.env.XPLOG_OWNER_UID || process.env.XPLOG_OWNER_EMAIL),
      groq: !!process.env.GROQ_API_KEY,
      cronSecret: !!process.env.CRON_SECRET,
      webSearch: hasWebSearch(),
      notion: !!(process.env.NOTION_API_KEY && process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID),
    },
  });
}
