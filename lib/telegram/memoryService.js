import { groqJson, hasGroq, describeImage } from "../server/groq.js";
import { createMemory, uploadPhoto } from "../server/memory.js";
import { ask } from "../server/rag.js";
import { extractTags } from "./commands.js";

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Short title + a few topical tags so the note is easy to find again. Falls back to the first line.
async function organize(text, photoTitle) {
  const fallback = { title: clip((text.split("\n")[0] || photoTitle || "").trim(), 60), tags: [] };
  if (!hasGroq() || !text) return { ...fallback, title: fallback.title || photoTitle || "照片" };
  try {
    const out = await groqJson(
      `You file short personal notes. Respond with ONLY strict JSON: {"title": string, "tags": string[]}.
- title: at most 40 characters, same language as the note, keeping the key item and figure (e.g. "鸡饭 RM8.50 @ Kedai Ali").
- tags: up to 4 short topical words in the note's language, no "#" (e.g. "价格", "美食", a place name) that would help find it later.`,
      text
    );
    const tags = (Array.isArray(out.tags) ? out.tags : []).filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().replace(/^#/, ""));
    return { title: (typeof out.title === "string" && out.title.trim()) || fallback.title, tags: tags.slice(0, 4) };
  } catch {
    return fallback;
  }
}

// What the bot (and the website's add form) call. Tests substitute their own.
export const defaultMemory = {
  // Saves one note to the Notion memory. `photo` = { buffer, mime, filename } or null.
  async save({ level, text, photo, entryRef }) {
    const { text: body, tags: typedTags } = extractTags(text || "");

    let uploadId = null;
    let vision = null;
    let photoError = null;
    if (photo) {
      const [up, seen] = await Promise.allSettled([
        uploadPhoto(photo.buffer, photo.mime, photo.filename),
        hasGroq() ? describeImage(photo.buffer, photo.mime, body) : Promise.resolve(null),
      ]);
      if (up.status === "fulfilled") uploadId = up.value;
      else photoError = up.reason?.message || "上传失败";
      if (seen.status === "fulfilled") vision = seen.value;
    }

    const photoLines = vision
      ? [vision.description && `📷 ${vision.description}`, vision.text && `照片上的文字:${vision.text}`].filter(Boolean).join("\n")
      : "";
    const forTitle = [body, vision?.text].filter(Boolean).join("\n");
    const { title, tags: aiTags } = await organize(forTitle, vision?.title);
    const tags = [...new Set([...typedTags, ...aiTags])];

    const content = [body, photoLines, tags.length ? tags.map((t) => `#${t}`).join(" ") : ""].filter(Boolean).join("\n\n");
    if (!content && !uploadId) throw new Error("没有可保存的内容");

    const page = await createMemory({
      title: title || vision?.title || "照片",
      content: content || "(照片)",
      level,
      photoUploadId: uploadId,
      entryRef,
    });
    return { page, tags, photoSaved: !!uploadId, photoError, vision };
  },

  ask,
};
