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

const toSource = (r) => ({
  id: r.id,
  title: r.title,
  date: fmtDate(r.createdTime),
  level: r.level,
  url: r.url,
  snippet: r.content.replace(/\s+/g, " ").slice(0, 100),
});

// ---- Answering rules ------------------------------------------------------------------
// 1. Answer ONLY from the retrieved notes - never from general knowledge or guesses.
// 2. If the notes don't actually contain the answer, say "I don't have the answer".
// 3. Even then, show the closest notes as references so the user can look through them.
const hasChinese = (s) => /[一-鿿]/.test(s);
export const noAnswerMessage = (question) =>
  hasChinese(question) ? "我没有这个问题的答案。" : "I don't have the answer to that.";

const ANSWER_RULES = `You answer questions from the user's own saved notes (their personal knowledge base).
Rules - follow them strictly:
1. Use ONLY the notes provided. Never use outside knowledge, and never guess or infer facts about the user's life that the notes do not state.
2. Set "answerable" to true ONLY if the notes explicitly contain the information that answers the question. Notes that are merely on a related topic do NOT count.
3. If answerable is false, set "answer" to exactly one short sentence in the question's language saying you don't have the answer (e.g. "I don't have the answer to that." / "我没有这个问题的答案。"). Do not add any other information.
4. If answerable is true: reply in the language of the question, concise and direct. Quote exact figures (prices, names, places) and say when each note was saved. If several notes disagree (e.g. a price changed over time), list them newest first.
Respond with ONLY strict JSON: {"answerable": boolean, "answer": string, "used": number[]} where "used" lists the note numbers you relied on (empty when not answerable).`;

const defaultDeps = { retrieve, json: groqJson, available: hasGroq };

export async function ask(question, deps = {}) {
  const { retrieve: retrieveFn, json, available } = { ...defaultDeps, ...deps };
  const { keywords, items } = await retrieveFn(question);

  // Nothing related in the notes at all.
  if (!items.length) {
    return { answer: `${noAnswerMessage(question)}\n记忆库里没有找到相关内容。(搜索了:${keywords.join("、") || "—"})`, sources: [], answered: false };
  }

  if (available()) {
    try {
      const notes = items
        .map((r, i) => `[${i + 1}] saved ${fmtDate(r.createdTime)}${r.level ? ` · ${r.level}` : ""}\n${r.title}\n${r.content.slice(0, 900)}`)
        .join("\n\n");
      const out = await json(ANSWER_RULES, `Question: ${question}\n\nSaved notes:\n${notes}`);
      if (out.answerable === true && typeof out.answer === "string" && out.answer.trim()) {
        const used = (Array.isArray(out.used) ? out.used : []).map((n) => items[Number(n) - 1]).filter(Boolean);
        return { answer: out.answer.trim(), sources: (used.length ? used : items.slice(0, 3)).map(toSource), answered: true };
      }
      // Not answerable: say so plainly, and offer the closest notes as references.
      return { answer: noAnswerMessage(question), sources: items.slice(0, 5).map(toSource), answered: false };
    } catch {
      // fall through: the AI step failed, so we can't judge the notes
    }
  }

  // No AI available (or it failed): we can't tell whether the notes answer the question,
  // so don't pretend to - just hand over what was found.
  return {
    answer: "我没法判断这些记录能不能回答你的问题(AI 暂时不可用)。",
    sources: items.slice(0, 5).map(toSource),
    answered: false,
  };
}
