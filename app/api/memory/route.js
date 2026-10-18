import { requireOwner } from "@/lib/server/auth";
import { listMemories, setLevel, archiveMemory, levelByKey } from "@/lib/server/memory";
import { defaultMemory } from "@/lib/telegram/memoryService";

const fail = (e) => Response.json({ error: e.message || "failed" }, { status: 500 });

// Website 记忆库 <-> Notion. All routes require the signed-in owner.
export async function GET(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const levelParam = sp.get("level"); // trivia | thought | output | none | (all)
  try {
    return Response.json(
      await listMemories({
        level: levelParam === "none" ? "none" : levelByKey(levelParam)?.name,
        q: sp.get("q") || undefined,
        cursor: sp.get("cursor") || undefined,
      })
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { text, level } = await req.json();
  if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });
  try {
    const res = await defaultMemory.save({ level: levelByKey(level) ? level : "trivia", text, photo: null, entryRef: "web" });
    return Response.json({ item: res.page });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const { id, level } = await req.json();
  if (!id || !levelByKey(level)) return Response.json({ error: "id and valid level required" }, { status: 400 });
  try {
    return Response.json({ item: await setLevel(id, level) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req) {
  const denied = await requireOwner(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    await archiveMemory(id);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
