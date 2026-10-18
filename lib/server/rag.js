import { groqJson, hasGroq } from "./groq.js";
import { searchByKeywords } from "./memory.js";

// Retrieval-augmented answers over the Notion memory:
//   1. turn the question into search keywords (Groq adds synonyms/translations)
//   2. retrieve matching rows from Notion
//   3. have Groq answer ONLY from those rows (or list them if Groq isn't available)

const STOP_EN = new Set(["the", "a", "an", "of", "is", "are", "was", "what", "whats", "how", "much", "many", "price", "cost", "did", "do", "i", "my", "me", "for", "at", "in", "on", "to", "it", "that", "this", "where", "when", "which", "who", "tell", "about"]);
const STOP_ZH = ["多少钱", "价格", "价钱", "是多少", "是什么", "什么", "哪里", "在哪", "几钱", "多少", "我", "的", "是", "吗", "呢", "了", "有没有", "帮我", "查一下", "查查", "请问"];

// Used when Groq is unavailable: distinctive words only.
export function fallbackKeywords(question) {
  let q = question.toLowerCase();
  for (const w of STOP_ZH) q = q.split(w).join(" ");
  const words = [];
  for (const tok of q.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    if (/^[\p{Script=Han}]+$/u.test(tok)) {
      if (tok.length <= 4) words.push(tok);
      else for (let i = 0; i < tok.length - 1; i++) words.push(tok.slice(i, i + 2));
    } else if (tok.length >= 2 && !STOP_EN.has(tok)) {
      words.push(tok);
    }
  }
  return [...new Set(words)].slice(0, 8);
}

export async function expandQuery(question) {
  if (hasGroq()) {
    try {
      const system = `You prepare a search over a user's personal notes (titles and text, mixed English / Chinese / Malay).
Return the distinctive keywords to search for, as JSON: {"keywords": string[]} (max 8).
- Use the item, dish, product, place or topic words from the question.
- Add likely synonyms and translations (e.g. "chicken rice" -> "鸡饭", "nasi ayam").
- Do NOT include generic question words such as price, cost, how much, 多少钱 - the notes usually just contain the figure (e.g. "RM8.50").`;
      const out = await groqJson(system, question);
      const kws = (Array.isArray(out.keywords) ? out.keywords : []).filter((k) => typeof k === "string" && k.trim());
      if (kws.length) return kws.slice(0, 8);
    } catch {
      // fall through
    }
  }
  return fallbackKeywords(question);
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: process.env.XPLOG_TIMEZONE || "Asia/Kuala_Lumpur" }) : "");

export async function retrieve(question, limit = 8) {
  const keywords = await expandQuery(question);
  const rows = await searchByKeywords(keywords, 30);
  const lower = keywords.map((k) => k.toLowerCase());
  const scored = rows.map((r) => {
    const hay = `${r.title}\n${r.content}`.toLowerCase();
    return { r, score: lower.filter((k) => hay.includes(k)).length };
  });
  // Most keyword hits first; rows arrive newest-first, and the sort is stable.
  scored.sort((a, b) => b.score - a.score);
  // With Groq, the answering step judges relevance, so any hit may go to it. Without it the
  // raw list is shown to the user, so require at least half of the keywords to match.
  const minScore = hasGroq() ? 1 : Math.max(1, Math.ceil(keywords.length / 2));
  return { keywords, items: scored.filter((s) => s.score >= minScore).slice(0, limit).map((s) => s.r) };
}

const toSource = (r) => ({ id: r.id, title: r.title, date: fmtDate(r.createdTime), level: r.level, url: r.url });

export async function ask(question) {
  const { keywords, items } = await retrieve(question);
  if (!items.length) {
    return { answer: `没在记忆库里找到和「${question.slice(0, 40)}」相关的记录。\n(搜索了:${keywords.join("、") || "—"})`, sources: [], found: false };
  }

  if (hasGroq()) {
    try {
      const notes = items
        .map((r, i) => `[${i + 1}] saved ${fmtDate(r.createdTime)}${r.level ? ` · ${r.level}` : ""}\n${r.title}\n${r.content.slice(0, 900)}`)
        .join("\n\n");
      const system = `You answer questions from the user's own saved notes (their personal knowledge base).
Rules:
- Use ONLY the notes provided. Never guess or use outside knowledge for facts about the user's life.
- Reply in the language of the question, concise and direct. Quote exact figures (prices, names, places) and say when each note was saved.
- If several notes disagree (e.g. a price changed over time), list them newest first.
- If the notes do not actually answer the question, say you could not find it in the saved notes.
Respond with ONLY strict JSON: {"answer": string, "used": number[]} where "used" lists the note numbers you relied on.`;
      const out = await groqJson(system, `Question: ${question}\n\nSaved notes:\n${notes}`);
      if (typeof out.answer === "string" && out.answer.trim()) {
        const used = (Array.isArray(out.used) ? out.used : []).map((n) => items[Number(n) - 1]).filter(Boolean);
        return { answer: out.answer.trim(), sources: (used.length ? used : items.slice(0, 3)).map(toSource), found: true };
      }
    } catch {
      // fall through to the plain list
    }
  }

  // No Groq (or it failed): show what was found.
  const lines = items.slice(0, 5).map((r) => `• ${r.title}${r.content ? ` — ${r.content.replace(/\s+/g, " ").slice(0, 120)}` : ""}  (${fmtDate(r.createdTime)})`);
  return { answer: `找到 ${items.length} 条相关记录:\n${lines.join("\n")}`, sources: items.slice(0, 5).map(toSource), found: true };
}
