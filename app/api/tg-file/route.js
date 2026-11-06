import { downloadTelegramFile, signFileId } from "@/lib/server/telegramFiles";

export const runtime = "nodejs";

// Shows a photo / plays a voice note that arrived through Telegram. The link is signed when the dump
// is created (see handleDump), so only links from your own dump box work and the bot token stays here.
export async function GET(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id || url.searchParams.get("sig") !== signFileId(id)) return new Response("not found", { status: 404 });
  try {
    const file = await downloadTelegramFile(id);
    return new Response(file.buffer, { headers: { "Content-Type": file.mime, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
