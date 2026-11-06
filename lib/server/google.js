import { createHmac, timingSafeEqual } from "node:crypto";

// Google Calendar access: OAuth (you sign in once, we keep a refresh token on the server only) and a
// tiny Calendar REST client. Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (see README).
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUriFor = (origin) => process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;

// The OAuth "state" says which account is connecting; it is signed so nobody can forge it.
const key = () => process.env.GOOGLE_CLIENT_SECRET || "";
const sign = (payload) => createHmac("sha256", key()).update(payload).digest("base64url");
export function signState(uid, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid, t: now })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyState(state, now = Date.now()) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return now - data.t < 15 * 60000 ? data.uid : null;
}

export function authUrl({ origin, state }) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUriFor(origin), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH}?${q}`;
}

async function tokenRequest(params, fetchFn) {
  const res = await fetchFn(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error === "invalid_grant" ? "Google 授权已失效,请在设置里重新连接" : data.error_description || data.error || `Google ${res.status}`);
    e.code = data.error;
    throw e;
  }
  return data;
}

export const exchangeCode = (code, origin, fetchFn = fetch) => tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUriFor(origin) }, fetchFn);

// Calendar client for one user. Keeps the access token fresh (state lives in store.getPrivate("google")).
export function makeGcal(store, fetchFn = fetch) {
  let state = null;

  async function token() {
    state ||= (await store.getPrivate("google")) || {};
    if (!state.refreshToken) throw new Error("还没有连接 Google 日历");
    if (state.accessToken && state.expiresAt > Date.now() + 60000) return state.accessToken;
    const data = await tokenRequest({ refresh_token: state.refreshToken, grant_type: "refresh_token" }, fetchFn);
    state = { ...state, accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    // keep the newest state on disk, but never overwrite changes made by a concurrent sync
    const fresh = (await store.getPrivate("google")) || {};
    await store.setPrivate("google", { ...fresh, accessToken: state.accessToken, expiresAt: state.expiresAt });
    return state.accessToken;
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetchFn(`${CAL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error?.message || `Google Calendar ${res.status}`);
      e.code = res.status;
      throw e;
    }
    return data;
  }

  return {
    // Everything that changed since `syncToken` (or, on the first run, the last 90 days onwards).
    async listChanges({ syncToken = null } = {}) {
      const items = [];
      let pageToken = null;
      let next = null;
      do {
        const q = new URLSearchParams({ maxResults: "250", singleEvents: "false" });
        if (syncToken) q.set("syncToken", syncToken);
        else q.set("timeMin", new Date(Date.now() - 90 * 86400000).toISOString());
        if (pageToken) q.set("pageToken", pageToken);
        const r = await api(`/events?${q}`);
        items.push(...(r.items || []));
        pageToken = r.nextPageToken || null;
        next = r.nextSyncToken || next;
      } while (pageToken);
      return { items, nextSyncToken: next };
    },
    insert: (body) => api("/events", { method: "POST", body }),
    patch: (id, body) => api(`/events/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    async remove(id) {
      try {
        await api(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch (e) {
        if (e.code !== 404 && e.code !== 410) throw e; // already gone is fine
      }
    },
  };
}
