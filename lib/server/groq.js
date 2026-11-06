import OpenAI, { toFile } from "openai";

// Groq exposes an OpenAI-compatible API, so the openai SDK works with a different base URL.
// Groq retires models fairly often, so unless GROQ_MODEL / GROQ_VISION_MODEL are set we pick the
// first model from a preference list that your account actually offers (see /v1/models).
const TEXT_PREFERENCE = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"];
const VISION_PREFERENCE = ["qwen/qwen3.8-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];

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

// Speech to text (Whisper on Groq). `buffer` = the audio file bytes. Returns the transcript.
export async function transcribeAudio(buffer, mime = "audio/ogg", filename = "voice.ogg") {
  const file = await toFile(buffer, filename, { type: mime });
  const res = await client().audio.transcriptions.create({
    file,
    model: process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo",
    response_format: "json",
  });
  return String(res.text || "").trim();
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

// One chat turn with tools (OpenAI-style function calling). Returns the assistant message:
// { content, tool_calls? }. Used by the Telegram assistant.
export async function groqChat(messages, tools) {
  const model = await textModel();
  const res = await client().chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.2,
    ...extras(model),
  });
  return res.choices[0].message;
}

// Health check: can the chosen model actually call a tool? (used by GET /api/telegram)
export async function groqToolsCheck() {
  if (!hasGroq()) return "GROQ_API_KEY is not set";
  try {
    const msg = await groqChat(
      [{ role: "user", content: "Call the ping function with value 7." }],
      [{ type: "function", function: { name: "ping", description: "Returns pong", parameters: { type: "object", properties: { value: { type: "number" } }, required: ["value"] } } }]
    );
    return msg.tool_calls?.length ? `ok (called ${msg.tool_calls[0].function.name})` : "model did not call the tool";
  } catch (e) {
    return `failed: ${describeAiError(e)}`;
  }
}
