import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Server-side access to Firestore, used by the Telegram webhook. Unlike the browser SDK this
// bypasses security rules, so it must only ever write under the single configured owner.
// Credentials come from FIREBASE_SERVICE_ACCOUNT (the downloaded service-account JSON).
export function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  const sa = JSON.parse(raw);
  return initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      // Some env-var UIs store the key with literal "\n" instead of real newlines.
      privateKey: String(sa.private_key || "").replace(/\\n/g, "\n"),
    }),
  });
}

let cachedUid = null;

// The one account whose data the bot writes to: XPLOG_OWNER_UID, or looked up from the
// Google account email you sign in to XPLog with (XPLOG_OWNER_EMAIL).
export async function resolveOwnerUid() {
  if (cachedUid) return cachedUid;
  if (process.env.XPLOG_OWNER_UID) return (cachedUid = process.env.XPLOG_OWNER_UID);
  const email = process.env.XPLOG_OWNER_EMAIL;
  if (!email) throw new Error("Set XPLOG_OWNER_EMAIL (or XPLOG_OWNER_UID)");
  const user = await getAuth(adminApp()).getUserByEmail(email);
  return (cachedUid = user.uid);
}

// Thin data-access layer over users/{uid}/{collection}. The Telegram handlers only talk to
// this interface, which keeps them testable without Firebase.
export function createStore(uid) {
  const db = getFirestore(adminApp());
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
      await col("skills").doc(skillId).update({ totalXp: FieldValue.increment(delta) });
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
