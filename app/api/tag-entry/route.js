import { tagEntry } from "@/lib/server/groq";

export async function POST(req) {
  const { text, existingSkills } = await req.json();

  if (!text || !text.trim()) {
    return Response.json({ error: "text required" }, { status: 400 });
  }

  return Response.json(await tagEntry(text, Array.isArray(existingSkills) ? existingSkills : []));
}
