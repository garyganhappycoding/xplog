import { ownerFromRequest } from "@/lib/server/auth";
import { notionConfigured } from "@/lib/server/notion";
import { hasGroq } from "@/lib/server/groq";
import { googleConfigured } from "@/lib/server/google";

export const runtime = "nodejs";

// What the server has set up (booleans only; never any secrets). Shown on the app's settings page.
export async function GET(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  return Response.json({
    notion: notionConfigured(),
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALLOWED_CHAT_ID),
    groq: hasGroq(),
    google: googleConfigured(),
    cron: !!process.env.CRON_SECRET,
  });
}
