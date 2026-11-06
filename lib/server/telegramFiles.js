import { createHmac } from "node:crypto";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4",
};

// The website shows Telegram photos and plays voice notes through /api/tg-file?id=…&sig=…, so the bot
// token never reaches the browser. The signature stops anyone from asking the server for a file id
// they did not get from your own dump.
export const signFileId = (fileId) =>
  createHmac("sha256", process.env.TELEGRAM_WEBHOOK_SECRET || "xplog-dev").update(String(fileId)).digest("hex").slice(0, 24);

export const fileUrl = (fileId) => `/api/tg-file?id=${encodeURIComponent(fileId)}&sig=${signFileId(fileId)}`;

// Downloads a file the bot received. -> { buffer, mime, filename }
export async function downloadTelegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  if (!info.ok) throw new Error(info.description || "getFile failed");
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
  if (!res.ok) throw new Error("download failed");
  const ext = (info.result.file_path.split(".").pop() || "jpg").toLowerCase();
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mime: MIME[ext] || "application/octet-stream",
    filename: `telegram-${Date.now()}.${ext}`,
  };
}
