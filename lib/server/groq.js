import OpenAI from "openai";

// Groq exposes an OpenAI-compatible API, so the openai SDK works with a different base URL.
// Groq retires models fairly often, so unless GROQ_MODEL / GROQ_VISION_MODEL are set we pick the
// first model from a preference list that your account actually offers (see /v1/models).
const TEXT_PREFERENCE = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"];
const VISION_PREFERENCE = ["qwen/qwen3.8-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];
const MIN_XP = 1;
const MAX_XP = 10;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const client = () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

export const hasGroq = () => !!process.env.GROQ_API_KEY;

let modelIds = null; // cached for the life of the server instance
async function availableModels() {
  if (!modelIds) modelIds = (await client().models.list()).data.map((m) => m.id);
  return modelIds;
}

async function pickModel(envValue, preference) {
  if (envValue) return envValue;
  try {
    const ids = await availableModels();
    return preference.find((m) => ids.includes(m)) || preference[0];
  } catch {
    return preference[0];
  }
}
const textModel = () => pickModel(process.env.GROQ_MODEL, TEXT_PREFERENCE);
const visionModel = () => pickModel(process.env.GROQ_VISION_MODEL, VISION_PREFERENCE);

// Reasoning models may wrap their answer in <think>…</think> or prose; take the JSON object.
function parseJsonLoose(content) {
  const text = String(content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}

// gpt-oss models "think" before answering; keep that short so replies stay fast.
const extras = (model) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {});

// JSON mode when the model supports it; if Groq rejects that parameter (400), ask again without it -
// the prompts already demand strict JSON and parseJsonLoose copes with stray text.
async function complete(model, messages) {
  const base = { model, messages, ...extras(model) };
  try {
    return await client().chat.completions.create({ ...base, response_format: { type: "json_object" } });
  } catch (e) {
    if (e.status !== 400) throw e;
    return client().chat.completions.create(base);
  }
}

// One JSON completion; returns the parsed object (throws on API/JSON errors).
export async function groqJson(system, user) {
  const response = await complete(await textModel(), [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
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
  const response = await complete(await visionModel(), [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: hint ? `The user's own note about this photo: ${hint}` : "Describe this photo." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } },
      ],
    },
  ]);
  const out = parseJsonLoose(response.choices?.[0]?.message?.content);
  return {
    title: typeof out.title === "string" ? out.title.trim() : "",
    description: typeof out.description === "string" ? out.description.trim() : "",
    text: typeof out.text === "string" ? out.text.trim() : "",
  };
}

// Health check for GET /api/telegram: does the key work, which models will be used, and does a
// real JSON call succeed? Never includes the key itself.
export async function groqStatus() {
  if (!hasGroq()) return { ok: false, problem: "GROQ_API_KEY is not set" };
  try {
    const ids = await availableModels();
    const text = await textModel();
    const vision = await visionModel();
    const started = Date.now();
    let chat;
    try {
      const out = await groqJson('Reply with ONLY this JSON: {"ok": true}', "ping");
      chat = out.ok === true ? `ok (${Date.now() - started} ms)` : `unexpected reply: ${JSON.stringify(out).slice(0, 80)}`;
    } catch (e) {
      chat = `failed: ${describeAiError(e)}`;
    }
    return { key: "accepted", textModel: text, textModelAvailable: ids.includes(text), visionModel: vision, visionModelAvailable: ids.includes(vision), jsonChatTest: chat, ok: chat.startsWith("ok") };
  } catch (e) {
    return { ok: false, key: "rejected or unreachable", status: e.status, problem: describeAiError(e) };
  }
}

// Short, safe description of why an AI call failed (shown to the user in the bot's reply).
export const describeAiError = (e) => `${e?.status ? `${e.status} ` : ""}${String(e?.message || e).replace(/\s+/g, " ").slice(0, 120)}`;
