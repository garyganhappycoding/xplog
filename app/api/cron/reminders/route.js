import { createStore, resolveOwnerUid } from "@/lib/server/firebaseAdmin";
import { runReminders } from "@/lib/server/reminders";
import { sendTelegram } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

// Called on a schedule (see vercel.json for the daily one; ping it every few minutes from an
// external cron for timely event reminders). It sends any reminders that are due to your Telegram.
// Protected by CRON_SECRET: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically,
// and any other scheduler can send the same header.
async function handle(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!chatId) return Response.json({ error: "TELEGRAM_ALLOWED_CHAT_ID is not set" }, { status: 503 });

  try {
    const store = await createStore(await resolveOwnerUid());
    const sent = await runReminders({
      store,
      send: (text) => sendTelegram(chatId, text),
      eventLeadMinutes: Number(process.env.REMINDER_EVENT_MINUTES) || 30,
      digestHour: Number(process.env.DIGEST_HOUR ?? 8),
    });
    return Response.json({ ok: true, sent: sent.length, keys: sent.map((s) => s.key) });
  } catch (e) {
    console.error("reminders failed", e);
    return Response.json({ error: e.message || "failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
