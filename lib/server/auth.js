import { getAuth } from "firebase-admin/auth";
import { adminApp, resolveOwnerUid } from "./firebaseAdmin.js";

// Guards the website's API routes that read your private notes. The browser sends its Firebase
// ID token; only the configured owner account gets through. Returns null when allowed, or a
// Response to send back.
export async function requireOwner(req) {
  // Local development only (never honoured in a production build).
  if (process.env.NODE_ENV !== "production" && process.env.XPLOG_DEV_SKIP_AUTH === "1") return null;

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(token);
    if (decoded.uid !== (await resolveOwnerUid())) return Response.json({ error: "forbidden" }, { status: 403 });
    return null;
  } catch (e) {
    if (/FIREBASE_SERVICE_ACCOUNT|XPLOG_OWNER/.test(e.message || "")) {
      return Response.json({ error: `服务器还没配置好:${e.message}` }, { status: 503 });
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
