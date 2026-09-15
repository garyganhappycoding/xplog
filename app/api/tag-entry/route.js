import OpenAI from "openai";

const MIN_XP = 1;
const MAX_XP = 10;

const FALLBACK = { skill: "Uncategorized", xpDelta: MIN_XP, confidence: 0 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export async function POST(req) {
  const { text, existingSkills } = await req.json();

  if (!text || !text.trim()) {
    return Response.json({ error: "text required" }, { status: 400 });
  }

  const skillList = Array.isArray(existingSkills) ? existingSkills.filter(Boolean) : [];

  const system = `You are an XP-tagging assistant inside a personal life-logging app. Given a diary entry, infer which single skill it demonstrates progress in and how much XP it is worth.

Rules:
- Prefer reusing one of the user's existing skills over inventing a near-duplicate (e.g. reuse "Public Speaking" rather than creating "Speaking").
- xpDelta must be an integer from ${MIN_XP} to ${MAX_XP}, scaled to how much real effort/progress the entry describes.
- confidence is a number from 0 to 1, how sure you are about the skill classification.
- If you cannot confidently infer a skill, set skill to "Uncategorized" and confidence low.
- Respond with ONLY strict JSON, no prose, no markdown fences: {"skill": string, "xpDelta": integer, "confidence": number}`;

  const userMsg = `Existing skills: ${skillList.length ? skillList.join(", ") : "(none yet)"}\n\nDiary entry:\n${text}`;

  try {
    const client = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
    const response = await client.chat.completions.create({
      model: "grok-4.6",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed.skill !== "string" || !parsed.skill.trim()) {
      return Response.json(FALLBACK);
    }

    return Response.json({
      skill: parsed.skill.trim(),
      xpDelta: clamp(Math.round(Number(parsed.xpDelta) || MIN_XP), MIN_XP, MAX_XP),
      confidence: clamp(Number(parsed.confidence) || 0, 0, 1),
    });
  } catch {
    return Response.json(FALLBACK);
  }
}
