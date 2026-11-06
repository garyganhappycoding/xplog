import { notionFetch } from "./notion.js";
import { ensureLevelProperty, setLevel } from "./memory.js";

// Which Notion "Level" each app folder becomes. Only these folders (and every diary entry) reach Notion.
export const FOLDER_LEVEL = { idea: "thought", note: "trivia", link: "link", diary: "diary" };
export const NOTION_FOLDERS = Object.keys(FOLDER_LEVEL);

let levelsChecked = false;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plain = (text) => [{ text: { content: text.slice(0, 1900) } }];

// Bytes of the photo attached to a dump / diary entry, wherever it is kept: a Telegram file, a web
// address (Firebase Storage) or an inline data: URL. Returns { buffer, mime, filename } or null.
async function loadPhoto(doc, { loadTelegramFile, fetchFile = fetch }) {
  if (doc.kind !== "photo" && !doc.photoUrl) return null;
  if (doc.tgFileId && loadTelegramFile) return loadTelegramFile(doc.tgFileId);
  const url = doc.photoUrl;
  if (!url) return null;
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) return null;
    const mime = m[1] || "image/jpeg";
    return { buffer: Buffer.from(m[3], m[2] ? "base64" : "utf8"), mime, filename: `photo.${mime.split("/")[1] || "jpg"}` };
  }
  const res = await fetchFile(url);
  if (!res.ok) throw new Error(`photo download ${res.status}`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, filename: `photo.${mime.split("/")[1] || "jpg"}` };
}

// Pushes ONE dump item or diary entry to the Notion Idea Vault and remembers the page on the doc
// (so the app can show "saved to Notion" and re-filing only changes the Level).
//   collection: "dumps" | "diaryEntries"      folder: idea | note | link | diary (dumps only)
export async function syncToNotion({ store, memory, collection, id, folder, loadTelegramFile, fetchFile, ensureLevels = ensureLevelProperty, setLevelFn = setLevel }) {
  const doc = await store.get(collection, id);
  if (!doc) return { ok: false, error: "找不到这条内容" };
  const levelKey = collection === "diaryEntries" ? "diary" : FOLDER_LEVEL[folder];
  if (!levelKey) return { ok: false, error: "这个文件夹不会存进 Notion" };

  const fail = async (e) => {
    const error = String(e?.message || e || "同步失败").slice(0, 200);
    await store.update(collection, id, { notionState: "error", notionError: error });
    return { ok: false, error };
  };

  try {
    if (!levelsChecked) {
      await ensureLevels().catch(() => {}); // adds the Level options (链接 / 日记) if the database lacks them
      levelsChecked = true;
    }

    // Already in Notion: only the level (re-filed) or the diary text (edited) changes.
    if (doc.notionPageId) {
      if (collection === "dumps") await setLevelFn(doc.notionPageId, levelKey);
      else {
        await notionFetch(`/v1/pages/${doc.notionPageId}`, {
          method: "PATCH",
          body: { properties: { Name: { title: plain(clip((doc.text || "").split("\n")[0], 80)) }, Notes: { rich_text: plain(doc.text || "") } } },
        });
      }
      await store.update(collection, id, { notionState: "ok", notionError: null, notionLevel: levelKey });
      return { ok: true, pageId: doc.notionPageId, updated: true };
    }

    const photo = await loadPhoto(doc, { loadTelegramFile, fetchFile }).catch(() => null);
    const text = [doc.text, doc.url && !(doc.text || "").includes(doc.url) ? doc.url : ""].filter(Boolean).join("\n");
    const res = await memory.save({ level: levelKey, text, photo, entryRef: `xplog:${collection}:${id}` });
    await store.update(collection, id, { notionPageId: res.page.id, notionUrl: res.page.url || null, notionState: "ok", notionError: null, notionLevel: levelKey });
    return { ok: true, pageId: res.page.id, photoSaved: res.photoSaved };
  } catch (e) {
    return fail(e);
  }
}
