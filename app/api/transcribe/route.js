import { ownerFromRequest } from "@/lib/server/auth";
import { hasGroq, transcribeAudio } from "@/lib/server/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

// Voice notes recorded in the app: multipart form with a "file" field -> { text }.
export async function POST(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  if (!hasGroq()) return Response.json({ error: "没有配置 GROQ_API_KEY" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "no audio" }, { status: 400 });
  if (file.size > 24 * 1024 * 1024) return Response.json({ error: "录音太大了(最多约 24MB)" }, { status: 413 });

  try {
    const type = file.type || "audio/webm";
    const text = await transcribeAudio(Buffer.from(await file.arrayBuffer()), type, `voice.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 200) }, { status: 502 });
  }
}
