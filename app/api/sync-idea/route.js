import { syncIdeaToNotion } from "@/lib/server/notion";

export async function POST(req) {
  const { text, photoUrl, entryId, skill } = await req.json();

  if (!text || !entryId) {
    return Response.json({ error: "text and entryId required" }, { status: 400 });
  }

  const result = await syncIdeaToNotion({ text, photoUrl, entryId, skill });
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ pageId: result.pageId });
}
