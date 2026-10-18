"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Copy, Nfc, Play, Square, Trash2 } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { ConfirmDialog } from "@/components/ui";
import {
  fmtClock, fmtDuration, fmtDurationShort, notificationState, requestNotificationPermission, showTrackerNotification,
} from "@/lib/notify";

const DUPLICATE_TAP_MS = 8000; // the same tag read twice in a row is one tap, not start+stop
const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA");
const dayLabel = (key) => {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  return key === today ? "今天" : key === yesterday ? "昨天" : key.slice(5).replace("-", "月") + "日";
};

export default function TrackPage() {
  const { data: logs, loading: logsLoading, add: addLog, update: updateLog, remove: removeLog } = useCollection("timeLogs");
  const { data: tags, loading: tagsLoading, add: addTag, remove: removeTag } = useCollection("nfcTags");

  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState("");
  const [permission, setPermission] = useState(() => notificationState());
  const [activityInput, setActivityInput] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [deleteLog, setDeleteLog] = useState(null);
  const handled = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const running = logs.find((l) => !l.endedAt) || null;

  // ---- start / stop -----------------------------------------------------------------

  const stopSession = async (session, { quiet = false } = {}) => {
    const end = Date.now();
    await updateLog(session.id, { endedAt: end, durationMs: end - session.startedAt });
    if (!quiet) {
      const text = `${session.activity} · 用时 ${fmtDurationShort(end - session.startedAt)}`;
      setFlash(`⏹ 已结束:${text}`);
      showTrackerNotification({ title: "⏹ 计时结束", body: text, timestamp: end });
    }
  };

  const startSession = async (activity, source, tagId = null) => {
    const start = Date.now();
    await addLog({ activity, startedAt: start, endedAt: null, durationMs: null, source, tagId, createdAt: start });
    setFlash(`▶ 已开始:${activity}(${fmtClock(start)})`);
    showTrackerNotification({ title: `▶ 开始:${activity}`, body: `开始于 ${fmtClock(start)} · 点一下可以结束`, timestamp: start, running: true });
  };

  // One tap on a tag: same activity running -> stop it; otherwise switch to this activity.
  const tap = async (activity, source, tagId) => {
    const current = logs.find((l) => !l.endedAt);
    if (current && current.activity.toLowerCase() === activity.toLowerCase()) {
      if (Date.now() - current.startedAt < DUPLICATE_TAP_MS) {
        setFlash(`▶ 「${activity}」刚刚已经开始了`);
        return;
      }
      await stopSession(current);
      return;
    }
    if (current) await stopSession(current, { quiet: true });
    await startSession(activity, source, tagId);
  };

  // ---- opened from an NFC tap: /track?tag=ID  (or ?start=Name, ?action=stop) ---------
  useEffect(() => {
    if (logsLoading || tagsLoading || handled.current) return;
    handled.current = true;
    const sp = new URLSearchParams(window.location.search);
    const tagId = sp.get("tag");
    const startName = sp.get("start");
    const action = sp.get("action");
    if (!tagId && !startName && !action) return;

    (async () => {
      if (action === "stop") {
        const current = logs.find((l) => !l.endedAt);
        if (current) await stopSession(current);
        else setFlash("现在没有在计时");
      } else if (tagId) {
        const tag = tags.find((t) => t.id === tagId);
        if (tag) await tap(tag.activity, "nfc", tag.id);
        else setFlash("找不到这个标签,可能已经被删除了。");
      } else if (startName?.trim()) {
        await tap(startName.trim(), "nfc", null);
      }
      window.history.replaceState(null, "", "/track"); // so a refresh doesn't tap again
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logsLoading, tagsLoading]);

  // ---- tags (the physical NFC stickers/cards) ---------------------------------------

  const tagUrl = (tag) => `${window.location.origin}/track?tag=${tag.id}`;

  const createTag = async () => {
    const activity = newTagName.trim();
    if (!activity) return;
    await addTag({ activity, createdAt: Date.now() });
    setNewTagName("");
  };

  const copyUrl = async (tag) => {
    try {
      await navigator.clipboard.writeText(tagUrl(tag));
      setFlash("✓ 链接已复制");
    } catch {
      setFlash(tagUrl(tag));
    }
  };

  // Web NFC: Chrome on Android can write a tag straight from the browser.
  const writeToTag = async (tag) => {
    if (!("NDEFReader" in window)) {
      setFlash("这个浏览器不支持直接写入 NFC。请用 Android 的 Chrome,或把链接复制到「NFC Tools」App 里写入。");
      return;
    }
    try {
      setFlash("请把手机贴近空白的 NFC 标签…");
      await new window.NDEFReader().write({ records: [{ recordType: "url", data: tagUrl(tag) }] });
      setFlash(`✓ 已写入标签「${tag.activity}」。以后碰一下就会开始计时。`);
    } catch (e) {
      setFlash(`写入失败:${e.message}`);
    }
  };

  const enableNotifications = async () => {
    setPermission(await requestNotificationPermission());
  };

  // ---- display data -----------------------------------------------------------------

  const grouped = useMemo(() => {
    const byDay = new Map();
    [...logs].sort((a, b) => b.startedAt - a.startedAt).forEach((l) => {
      const k = dayKey(l.startedAt);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(l);
    });
    return [...byDay.entries()].slice(0, 7);
  }, [logs]);

  const todayTotals = useMemo(() => {
    const totals = new Map();
    for (const l of logs) {
      if (dayKey(l.startedAt) !== dayKey(now)) continue;
      const ms = (l.endedAt || now) - l.startedAt;
      totals.set(l.activity, (totals.get(l.activity) || 0) + ms);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs, now]);

  return (
    <>
      <ConfirmDialog
        open={!!deleteLog}
        title="删除这条记录?"
        message={deleteLog ? `「${deleteLog.activity}」这段计时记录会被删除。` : ""}
        confirmLabel="删除"
        onConfirm={async () => { const l = deleteLog; setDeleteLog(null); await removeLog(l.id); }}
        onCancel={() => setDeleteLog(null)}
      />

      <div className="xl-header"><div className="xl-title">计时</div></div>
      <div className="xl-subtitle" style={{ marginBottom: 16 }}>
        碰一下 NFC 标签就开始记录你在做的事,再碰同一个标签结束,碰另一个标签就切换。
      </div>

      {flash && <div className="xl-panel" style={{ whiteSpace: "pre-wrap" }}>{flash}</div>}

      <div className="xl-panel" style={{ textAlign: "center" }}>
        {running ? (
          <>
            <div className="xl-entry__meta">正在进行 · 开始于 {fmtClock(running.startedAt)}</div>
            <div className="xl-title" style={{ fontSize: 22, margin: "6px 0" }}>{running.activity}</div>
            <div className="xl-mono" style={{ fontSize: 40, color: "var(--gold-bright)", letterSpacing: "0.04em" }}>{fmtDuration(now - running.startedAt)}</div>
            <button className="xl-btn" style={{ marginTop: 14 }} onClick={() => stopSession(running)} type="button">
              <Square size={14} style={{ marginRight: 6, verticalAlign: -2 }} />结束计时
            </button>
          </>
        ) : (
          <div className="xl-subtitle" style={{ margin: 0 }}>现在没有在计时。碰一下 NFC 标签,或在下面手动开始。</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="xl-input"
          value={activityInput}
          onChange={(e) => setActivityInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && activityInput.trim()) { tap(activityInput.trim(), "manual", null); setActivityInput(""); } }}
          placeholder="手动开始:我要做什么?"
        />
        <button
          className="xl-btn--ghost"
          style={{ flexShrink: 0 }}
          onClick={() => { if (activityInput.trim()) { tap(activityInput.trim(), "manual", null); setActivityInput(""); } }}
          type="button"
        >
          <Play size={13} style={{ verticalAlign: -2 }} /> 开始
        </button>
      </div>
      {tags.length > 0 && (
        <div className="xl-pillrow" style={{ marginBottom: 16 }}>
          {tags.map((t) => (
            <button key={t.id} className={`xl-pill xl-pill--sm ${running?.activity === t.activity ? "xl-pill--active" : ""}`} onClick={() => tap(t.activity, "manual", t.id)} type="button">
              {t.activity}
            </button>
          ))}
        </div>
      )}

      {permission !== "granted" && (
        <div className="xl-panel" style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="xl-subtitle" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            {permission === "unsupported" ? "这个浏览器不支持通知。" : permission === "denied" ? "通知被禁用了。请在浏览器的网站设置里允许 XPLog 发送通知。" : "开启通知后,碰 NFC 标签时手机会弹出「已开始计时」。"}
          </div>
          {permission === "default" && (
            <button className="xl-btn--ghost" onClick={enableNotifications} type="button"><Bell size={13} style={{ verticalAlign: -2 }} /> 开启通知</button>
          )}
        </div>
      )}

      {todayTotals.length > 0 && (
        <>
          <div className="xl-label" style={{ marginTop: 18 }}>今天合计</div>
          <div className="xl-pillrow" style={{ marginBottom: 18 }}>
            {todayTotals.map(([name, ms]) => <span key={name} className="xl-pill xl-pill--sm" style={{ cursor: "default" }}>{name} · {fmtDurationShort(ms)}</span>)}
          </div>
        </>
      )}

      {grouped.map(([key, items]) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <div className="xl-label">{dayLabel(key)}</div>
          {items.map((l) => (
            <div key={l.id} className="xl-entry" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{l.activity}{l.source === "nfc" ? " 📶" : ""}</div>
                <div className="xl-entry__meta">{fmtClock(l.startedAt)} – {l.endedAt ? fmtClock(l.endedAt) : "进行中"}</div>
              </div>
              <div className="xl-mono" style={{ fontSize: 12, color: "var(--gold-bright)", flexShrink: 0 }}>
                {fmtDurationShort((l.endedAt || now) - l.startedAt)}
              </div>
              <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => setDeleteLog(l)} type="button" title="删除"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      ))}

      <div className="xl-label" style={{ marginTop: 24 }}>我的 NFC 标签</div>
      <div className="xl-subtitle" style={{ marginBottom: 10 }}>
        每个标签对应一件事。建好后,在 Android 的 Chrome 里点「写入标签」再把手机贴近空白标签即可。请在已部署的网址(不是 localhost)上操作,标签里存的就是这个网址。
      </div>
      {tags.map((t) => (
        <div key={t.id} className="xl-entry" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 600 }}>{t.activity}</div>
          <button className="xl-pill xl-pill--sm" onClick={() => writeToTag(t)} type="button"><Nfc size={11} style={{ verticalAlign: -1 }} /> 写入标签</button>
          <button className="xl-pill xl-pill--sm" onClick={() => copyUrl(t)} type="button"><Copy size={11} style={{ verticalAlign: -1 }} /> 复制链接</button>
          <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => removeTag(t.id)} type="button" title="删除标签"><Trash2 size={12} /></button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="xl-input"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createTag(); }}
          placeholder="新标签:例如 读书 / 写作业 / 运动"
        />
        <button className="xl-btn--ghost" style={{ flexShrink: 0 }} onClick={createTag} type="button">添加标签</button>
      </div>
    </>
  );
}
