import { requireOwner } from "@/lib/server/auth";
import { ask } from "@/lib/server/rag";

export const maxDuration = 30;

// Same question-answering the Telegram bot uses, for the website's 记忆库 page.
export async function POST(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { question } = await req.json();
  if (!question?.trim()) return Response.json({ error: "question required" }, { status: 400 });
  try {
    return Response.json(await ask(question.trim()));
  } catch (e) {
    return Response.json({ error: e.message || "failed" }, { status: 500 });
  }
}
