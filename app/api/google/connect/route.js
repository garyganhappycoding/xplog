import { ownerFromRequest } from "@/lib/server/auth";
import { authUrl, googleConfigured, signState } from "@/lib/server/google";

export const runtime = "nodejs";

// Step 1 of connecting Google Calendar: the app asks for the Google sign-in address (it has to be
// fetched with your login, then the browser goes there).
export async function GET(req) {
  const who = await ownerFromRequest(req);
  if (who.response) return who.response;
  if (!googleConfigured()) return Response.json({ error: "服务器还没有配置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET(见 README)" }, { status: 503 });
  return Response.json({ url: authUrl({ origin: new URL(req.url).origin, state: signState(who.uid) }) });
}
