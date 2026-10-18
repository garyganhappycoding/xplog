import { notionFetch, notionHeaders } from "./notion.js";

// The "记忆库": the Notion Idea Vault, used as one database for everything worth keeping.
// Each row has a Level so you know where to review it again:
export const LEVELS = [
  { key: "trivia", name: "琐碎事情", hint: "随手记下的小事:价格、看到的食物…" },
  { key: "thought", name: "思考过的事情", hint: "想过、整理过的想法" },
  { key: "output", name: "准备输出的事情", hint: "打算发布/分享的内容" },
];
export const levelByKey = (key) => LEVELS.find((l) => l.key === key);
export const levelByName = (name) => LEVELS.find((l) => l.name === name);

const dataSourceId = () => process.env.NOTION_IDEA_VAULT_DATA_SOURCE_ID;
const richText = (text) => {
  const chunks = [];
  for (let i = 0; i < text.length && chunks.length < 90; i += 1900) chunks.push({ text: { content: text.slice(i, i + 1900) } });
  return chunks;
};

// One-time: add the Level column (with the three options) to the Idea Vault if it's missing.
export async function ensureLevelProperty() {
  const ds = await notionFetch(`/v1/data_sources/${dataSourceId()}`);
  const existing = ds.properties?.Level?.select?.options || [];
  const missing = LEVELS.filter((l) => !existing.some((o) => o.name === l.name));
  if (ds.properties?.Level && !missing.length) return { changed: false };
  await notionFetch(`/v1/data_sources/${dataSourceId()}`, {
    method: "PATCH",
    body: { properties: { Level: { select: { options: [...existing.map((o) => ({ name: o.name })), ...missing.map((l) => ({ name: l.name }))] } } } },
  });
  return { changed: true };
}

// Uploads an image to Notion (hosted by Notion itself) and returns the file-upload id.
export async function uploadPhoto(buffer, mime = "image/jpeg", filename = "photo.jpg") {
  const created = await notionFetch("/v1/file_uploads", { method: "POST", body: { filename, content_type: mime } });
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), filename);
  const { "Content-Type": _drop, ...headers } = notionHeaders(); // let fetch set the multipart boundary
  await notionFetch(`/v1/file_uploads/${created.id}/send`, { method: "POST", body: form, headers });
  return created.id;
}

// Flattens a Notion page into what the app displays.
export function normalizePage(page) {
  const p = page.properties || {};
  const plain = (arr) => (arr || []).map((t) => t.plain_text).join("");
  const name = plain(p.Name?.title);
  const notes = plain(p.Notes?.rich_text);
  const [firstLine, ...rest] = name.split("\n");
  const photos = (p.Screenshot?.files || [])
    .map((f) => ({ name: f.name, url: f.file?.url || f.external?.url }))
    .filter((f) => f.url);
  return {
    id: page.id,
    title: firstLine.trim() || "(无标题)",
    content: [rest.join("\n").trim(), notes].filter(Boolean).join("\n\n"),
    level: p.Level?.select?.name || null,
    status: p.Status?.select?.name || null,
    skill: (p.Skill?.multi_select || []).map((o) => o.name),
    tags: [...new Set((`${name}\n${notes}`.match(/#[\p{L}\p{N}_-]+/gu) || []).map((t) => t.slice(1)))],
    photos,
    createdTime: page.created_time,
    url: page.url,
  };
}

export async function createMemory({ title, content, level, photoUploadId, entryRef }) {
  const lv = levelByKey(level) || LEVELS[0];
  const properties = {
    Name: { title: [{ text: { content: (title || content).trim().slice(0, 200) } }] },
    Notes: { rich_text: richText(content || "") },
    Level: { select: { name: lv.name } },
  };
  // 琐碎 items stay out of the Idea Vault review pipeline; thoughts/outputs wait in Inbox.
  if (lv.key !== "trivia") properties.Status = { select: { name: "Inbox" } };
  if (entryRef) properties["XPLog ID"] = { rich_text: [{ text: { content: entryRef } }] };
  if (photoUploadId) properties.Screenshot = { files: [{ type: "file_upload", file_upload: { id: photoUploadId }, name: "photo.jpg" }] };

  const page = await notionFetch("/v1/pages", {
    method: "POST",
    body: { parent: { type: "data_source_id", data_source_id: dataSourceId() }, properties },
  });
  return normalizePage(page);
}

const contains = (property, type, value) => ({ property, [type]: { contains: value } });

// Newest-first list, optionally narrowed to one level and/or a text search.
export async function listMemories({ level, q, cursor, pageSize = 30 } = {}) {
  const and = [];
  if (level === "none") and.push({ property: "Level", select: { is_empty: true } });
  else if (level) and.push({ property: "Level", select: { equals: level } });
  if (q) and.push({ or: [contains("Name", "title", q), contains("Notes", "rich_text", q)] });
  const res = await notionFetch(`/v1/data_sources/${dataSourceId()}/query`, {
    method: "POST",
    body: {
      ...(and.length ? { filter: and.length === 1 ? and[0] : { and } } : {}),
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: pageSize,
      ...(cursor ? { start_cursor: cursor } : {}),
    },
  });
  return { items: res.results.map(normalizePage), nextCursor: res.has_more ? res.next_cursor : null };
}

// Rows whose title or notes mention ANY of the keywords (the "retrieve" step of RAG).
export async function searchByKeywords(keywords, limit = 25) {
  const words = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 10);
  if (!words.length) return [];
  const res = await notionFetch(`/v1/data_sources/${dataSourceId()}/query`, {
    method: "POST",
    body: {
      filter: { or: words.flatMap((w) => [contains("Name", "title", w), contains("Notes", "rich_text", w)]) },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: limit,
    },
  });
  return res.results.map(normalizePage);
}

export async function setLevel(pageId, levelKey) {
  const lv = levelByKey(levelKey);
  if (!lv) throw new Error("unknown level");
  const page = await notionFetch(`/v1/pages/${pageId}`, { method: "PATCH", body: { properties: { Level: { select: { name: lv.name } } } } });
  return normalizePage(page);
}

// Moves the row to Notion's trash (recoverable from Notion for 30 days).
export async function archiveMemory(pageId) {
  await notionFetch(`/v1/pages/${pageId}`, { method: "PATCH", body: { in_trash: true } });
}
