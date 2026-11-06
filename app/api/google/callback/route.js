import { createStore } from "@/lib/server/firebaseAdmin";
import { exchangeCode, verifyState } from "@/lib/server/google";

export const runtime = "nodejs";

// Google sends you back here after you allow access. We keep the refresh token on the server only.
export async function GET(req) {
  const url = new URL(req.url);
  const back = (result) => Response.redirect(`${url.origin}/settings?google=${result}`, 302);
  if (url.searchParams.get("error")) return back("denied");

  const uid = verifyState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!uid || !code) return back("failed");

  try {
    const tokens = await exchangeCode(code, url.origin);
    const store = await createStore(uid);
    const old = (await store.getPrivate("google")) || {};
    if (!tokens.refresh_token && !old.refreshToken) return back("failed"); // Google only sends it on the first consent
    await store.setPrivate("google", {
      // a fresh connection starts a fresh sync (links are kept so nothing is duplicated)
      links: old.links || {},
      refreshToken: tokens.refresh_token || old.refreshToken,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      syncToken: null,
      connectedAt: Date.now(),
      lastError: null,
    });
    return back("connected");
  } catch (e) {
    console.error("google callback failed", e);
    return back("failed");
  }
}
