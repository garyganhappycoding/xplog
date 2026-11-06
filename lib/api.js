"use client";
import { auth } from "./firebase";

// fetch() to our own API routes with the signed-in user's Firebase ID token attached.
export async function authedFetch(path, init = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("not signed in");
  return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
}

export async function authedJson(path, init = {}) {
  const res = await authedFetch(path, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...data };
}

// ---- Notion ---------------------------------------------------------------------------------------
// Push one dump item (after you sort it into 想法/笔记/链接) or diary entry to the Idea Vault. The server
// records the result (notionPageId / notionState) on the document itself, so the screen updates live.
export async function syncToNotion({ collection, id, folder }) {
  try {
    return await authedJson("/api/notion/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection, id, folder }) });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- Google Calendar -----------------------------------------------------------------------------------
let enabled = false;
let timer = null;
export const setGoogleSyncEnabled = (v) => { enabled = v; };

// After the app changes an event or a to-do, tell the server to sync (waits a moment so a burst of
// edits becomes one sync).
export function scheduleGoogleSync(delay = 4000) {
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => { authedFetch("/api/google/sync", { method: "POST" }).catch(() => {}); }, delay);
}

// Sync right now (when the app opens, comes back to the front, and every few minutes).
export const runGoogleSync = () => (enabled ? authedFetch("/api/google/sync", { method: "POST" }).catch(() => {}) : Promise.resolve());

export const googleStatus = () => authedJson("/api/google/sync");
export const googleSyncNow = () => authedJson("/api/google/sync", { method: "POST" });
export const googleDisconnect = () => authedJson("/api/google/sync", { method: "DELETE" });
export async function googleConnect() {
  const res = await authedJson("/api/google/connect");
  if (res.url) window.location.href = res.url;
  return res;
}

export const serverStatus = () => authedJson("/api/status");
