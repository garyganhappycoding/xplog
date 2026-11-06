import { createStore } from "@/lib/server/firebaseAdmin";
import { ownerFromRequest } from "@/lib/server/auth";
import { googleConfigured, makeGcal } from "@/lib/server/google";
import { syncGoogle } from "@/lib/server/googleSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET    -> is Google Calendar connected, and how did the last sync go?
// POST   -> sync now (the app calls this after changes, and when it opens)
// DELETE -> disconnect (the refresh token is deleted; events already in either calendar stay)
export async function GET(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  const state = (await (await createStore(who.uid)).getPrivate("google")) || {};
  return Response.json({
    configured: googleConfigured(),
    connected: !!state.refreshToken,
    lastSync: state.lastSync || null,
    lastError: state.lastError || null,
    stats: state.lastStats || null,
  });
}

export async function POST(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  if (!googleConfigured()) return Response.json({ ok: false, error: "not configured" }, { status: 503 });
  const store = await createStore(who.uid);
  const out = await syncGoogle({ store, gcal: makeGcal(store) });
  return Response.json(out, { status: out.ok ? 200 : 502 });
}

export async function DELETE(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  await (await createStore(who.uid)).deletePrivate("google");
  return Response.json({ ok: true });
}
