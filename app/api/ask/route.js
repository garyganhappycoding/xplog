import { requireOwner } from "@/lib/server/auth";
import { ask } from "@/lib/server/rag";
import { createStore, resolveOwnerUid } from "@/lib/server/firebaseAdmin";

export const maxDuration = 30;

// Same question-answering the Telegram bot uses, for the website's 记忆库 page.
export async function POST(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { question } = await req.json();
  if (!question?.trim()) return Response.json({ error: "question required" }, { status: 400 });
  try {
    // The store lets the answer include your calendar events and to-dos, not just Notion notes.
    const store = await createStore(await resolveOwnerUid());
    return Response.json(await ask(question.trim(), { store }));
  } catch (e) {
    return Response.json({ error: e.message || "failed" }, { status: 500 });
  }
}
