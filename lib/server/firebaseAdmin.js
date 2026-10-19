// Server-side access to Firestore, used by the Telegram webhook. Unlike the browser SDK this
// bypasses security rules, so it must only ever write under the single configured owner.
// Credentials come from FIREBASE_SERVICE_ACCOUNT (the downloaded service-account JSON).
//
// firebase-admin is imported lazily so that a problem loading it surfaces as a readable error
// (and in GET /api/telegram) rather than crashing every route that touches this file.
// Only the app + Firestore parts are used. firebase-admin/auth is deliberately avoided: it pulls
// in jwks-rsa -> jose (ESM only), which crashes on Node versions older than 22. The two things
// we need from Auth are done with Google's Identity Toolkit REST API instead (see below).
const load = async () => {
  const [app, firestore] = await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  return { app, firestore };
};

export async function adminApp() {
  const { app } = await load();
  if (app.getApps().length) return app.getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the whole file contents)");
  }
  return app.initializeApp({
    projectId: sa.project_id,
    credential: app.cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      // Some env-var UIs store the key with literal "\n" instead of real newlines.
      privateKey: String(sa.private_key || "").replace(/\\n/g, "\n"),
    }),
  });
}

// Reports whether the SDK can be loaded at all (used by GET /api/telegram for diagnosis).
export async function adminSdkStatus() {
  try {
    await load();
    return "ok";
  } catch (e) {
    return `failed to load: ${String(e.message || e).slice(0, 300)}`;
  }
}

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";

// Checks a Firebase ID token from the browser and returns the signed-in user's uid.
// Google validates the signature, expiry and revocation; no extra library needed.
export async function verifyIdToken(idToken) {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");
  const res = await fetch(`${IDENTITY}/accounts:lookup?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json().catch(() => ({}));
  const uid = data.users?.[0]?.localId;
  if (!res.ok || !uid) throw new Error("invalid token");
  return uid;
}

async function lookupUidByEmail(email) {
  const app = await adminApp();
  const { access_token: accessToken } = await app.options.credential.getAccessToken();
  const res = await fetch(`${IDENTITY}/projects/${app.options.projectId}/accounts:lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ email: [email] }),
  });
  const data = await res.json().catch(() => ({}));
  const uid = data.users?.[0]?.localId;
  if (!res.ok || !uid) {
    throw new Error(
      data.error?.message
        ? `could not look up ${email}: ${data.error.message}`
        : `no Firebase user with email ${email} (sign in to XPLog once with that account, or set XPLOG_OWNER_UID)`
    );
  }
  return uid;
}

let cachedUid = null;

// The one account whose data the bot writes to: XPLOG_OWNER_UID, or looked up from the
// Google account email you sign in to XPLog with (XPLOG_OWNER_EMAIL).
export async function resolveOwnerUid() {
  if (cachedUid) return cachedUid;
  if (process.env.XPLOG_OWNER_UID) return (cachedUid = process.env.XPLOG_OWNER_UID);
  const email = process.env.XPLOG_OWNER_EMAIL;
  if (!email) throw new Error("Set XPLOG_OWNER_EMAIL (or XPLOG_OWNER_UID)");
  return (cachedUid = await lookupUidByEmail(email));
}

// Thin data-access layer over users/{uid}/{collection}. The Telegram handlers only talk to
// this interface, which keeps them testable without Firebase.
export async function createStore(uid) {
  const { firestore } = await load();
  const db = firestore.getFirestore(await adminApp());
  const col = (name) => db.collection("users").doc(uid).collection(name);
  return {
    async list(name) {
      const snap = await col(name).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async add(name, data) {
      const ref = await col(name).add(data);
      return ref.id;
    },
    async update(name, id, data) {
      await col(name).doc(id).update(data);
    },
    async addXp(skillId, delta) {
      await col("skills").doc(skillId).update({ totalXp: firestore.FieldValue.increment(delta) });
    },
    async remove(name, id) {
      await col(name).doc(id).delete();
    },
    // Atomic "first one wins" markers, so a reminder is never sent twice even if two scheduler
    // runs overlap. claim() returns false if someone already claimed the key.
    async claim(key) {
      try {
        await col("reminderLog").doc(key).create({ at: Date.now() });
        return true;
      } catch (e) {
        if (e.code === 6 || /already exists/i.test(e.message || "")) return false;
        throw e;
      }
    },
    async unclaim(key) {
      await col("reminderLog").doc(key).delete();
    },
    // The last photo/message that was NOT saved to Notion, kept briefly so the user can say
    // "save this into notion" afterwards. Expires after a day.
    async setPending(item) {
      await db.collection("users").doc(uid).collection("telegramState").doc("pending").set(item);
    },
    async takePending() {
      const ref = db.collection("users").doc(uid).collection("telegramState").doc("pending");
      const snap = await ref.get();
      if (!snap.exists) return null;
      await ref.delete();
      const item = snap.data();
      return Date.now() - (item.at || 0) < 24 * 3600 * 1000 ? item : null;
    },
    // Telegram retries a webhook that was slow to answer; remember processed update ids
    // so the same message is never logged twice. Returns false if already handled.
    async claimUpdate(updateId) {
      try {
        await col("telegramUpdates").doc(String(updateId)).create({ at: Date.now() });
        return true;
      } catch (e) {
        if (e.code === 6 || /already exists/i.test(e.message || "")) return false;
        throw e;
      }
    },
  };
}
