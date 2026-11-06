import { createStore } from "@/lib/server/firebaseAdmin";
import { ownerFromRequest } from "@/lib/server/auth";
import { syncToNotion } from "@/lib/server/notionSync";
import { defaultMemory } from "@/lib/telegram/memoryService";
import { downloadTelegramFile } from "@/lib/server/telegramFiles";
import { notionConfigured } from "@/lib/server/notion";

export const runtime = "nodejs";
export const maxDuration = 60;

// The website calls this after you sort a dump item into 想法 / 笔记 / 链接 / 日记, and after every
// diary entry is saved. Body: { collection: "dumps" | "diaryEntries", id, folder? }
export async function POST(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  if (!notionConfigured()) return Response.json({ ok: false, error: "Notion 还没有配置(NOTION_API_KEY / NOTION_IDEA_VAULT_DATA_SOURCE_ID)" }, { status: 503 });

  const { collection, id, folder } = await req.json().catch(() => ({}));
  if (!["dumps", "diaryEntries"].includes(collection) || !id) return Response.json({ ok: false, error: "bad request" }, { status: 400 });

  const store = await createStore(who.uid);
  const out = await syncToNotion({ store, memory: defaultMemory, collection, id, folder, loadTelegramFile: downloadTelegramFile });
  return Response.json(out, { status: out.ok ? 200 : 500 });
}
