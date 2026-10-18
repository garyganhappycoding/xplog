// Browser notifications for the NFC time tracker.
// Permission can only be requested from a user gesture (a button), so the tracker page has an
// "enable notifications" button; once granted, a tap on an NFC tag can notify with no extra step.

export const notificationState = () =>
  typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission;

export async function requestNotificationPermission() {
  if (notificationState() === "unsupported") return "unsupported";
  return Notification.requestPermission();
}

// Shows (or replaces) the tracker notification. Uses the service worker when there is one
// (needed on Android), otherwise a plain Notification. Returns false if nothing could be shown.
export async function showTrackerNotification({ title, body, timestamp, running = false }) {
  if (notificationState() !== "granted") return false;
  const options = {
    body,
    tag: "xplog-tracker", // one slot: a new start/stop replaces the previous notification
    renotify: true,
    requireInteraction: running, // keep it visible while something is being timed
    timestamp,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: "/track" },
    ...(running ? { actions: [{ action: "stop", title: "结束计时" }] } : {}),
  };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export const fmtDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

// "1 小时 5 分" / "12 分" / "<1 分"
export const fmtDurationShort = (ms) => {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1 分";
  const h = Math.floor(mins / 60);
  return h ? `${h} 小时${mins % 60 ? ` ${mins % 60} 分` : ""}` : `${mins} 分`;
};

export const fmtClock = (ms) => new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
