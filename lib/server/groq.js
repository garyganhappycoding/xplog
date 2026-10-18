import OpenAI from "openai";

// Groq exposes an OpenAI-compatible API, so the openai SDK works with a different base URL.
// Models can be swapped with env vars if Groq retires one (see https://console.groq.com/docs/models).
const MODEL = () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
const MIN_XP = 1;
const MAX_XP = 10;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const client = () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

export const hasGroq = () => !!process.env.GROQ_API_KEY;

// Reasoning models may wrap their answer in <think>…</think> or prose; take the JSON object.
function parseJsonLoose(content) {
  const text = String(content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}

// One JSON-mode completion; returns the parsed object (throws on API/JSON errors).
export async function groqJson(system, user) {
  const response = await client().chat.completions.create({
    model: MODEL(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  return parseJsonLoose(response.choices?.[0]?.message?.content);
}

const TAG_FALLBACK = { skill: "Uncategorized", xpDelta: MIN_XP, confidence: 0 };

// Infers which skill a diary entry belongs to and how much XP it is worth.
// Never throws: any failure degrades to "Uncategorized" / 1 XP.
export async function tagEntry(text, existingSkills = []) {
  const skillList = existingSkills.filter(Boolean);

  const system = `You are an XP-tagging assistant inside a personal life-logging app. Given a diary entry, infer which single skill it demonstrates progress in and how much XP it is worth.

Rules:
- Prefer reusing one of the user's existing skills over inventing a near-duplicate (e.g. reuse "Public Speaking" rather than creating "Speaking").
- xpDelta must be an integer from ${MIN_XP} to ${MAX_XP}, scaled to how much real effort/progress the entry describes.
- confidence is a number from 0 to 1, how sure you are about the skill classification.
- If you cannot confidently infer a skill, set skill to "Uncategorized" and confidence low.
- Respond with ONLY strict JSON, no prose, no markdown fences: {"skill": string, "xpDelta": integer, "confidence": number}`;

  const userMsg = `Existing skills: ${skillList.length ? skillList.join(", ") : "(none yet)"}\n\nDiary entry:\n${text}`;

  try {
    const parsed = await groqJson(system, userMsg);
    if (!parsed || typeof parsed.skill !== "string" || !parsed.skill.trim()) return TAG_FALLBACK;
    return {
      skill: parsed.skill.trim(),
      xpDelta: clamp(Math.round(Number(parsed.xpDelta) || MIN_XP), MIN_XP, MAX_XP),
      confidence: clamp(Number(parsed.confidence) || 0, 0, 1),
    };
  } catch {
    return TAG_FALLBACK;
  }
}

// Reads a photo the user saves (price tag, menu, food, receipt...) so it becomes searchable.
// Best-effort: callers should treat any failure as "no description".
export async function describeImage(buffer, mime = "image/jpeg", hint = "") {
  const system = `You read photos that a user saves into their personal notes: price tags, menus, food, receipts, signs, whiteboards.
Respond with ONLY strict JSON: {"title": string, "description": string, "text": string}
- title: a short title (max 40 characters), in the language of any text visible in the photo.
- description: one or two sentences saying what is shown (dish, shop, product...).
- text: every legible piece of text, especially names, prices and currency, copied exactly; empty string if none.`;
  const response = await client().chat.completions.create({
    model: VISION_MODEL(),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: hint ? `The user's own note about this photo: ${hint}` : "Describe this photo." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  const out = parseJsonLoose(response.choices?.[0]?.message?.content);
  return {
    title: typeof out.title === "string" ? out.title.trim() : "",
    description: typeof out.description === "string" ? out.description.trim() : "",
    text: typeof out.text === "string" ? out.text.trim() : "",
  };
}
