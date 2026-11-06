"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, Loader2, LogOut, MoonStar, Send } from "lucide-react";
import { TopBar } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useCollection } from "@/lib/useCollection";
import { DUMP_CATEGORIES } from "@/lib/items";
import { googleConnect, googleDisconnect, googleStatus, googleSyncNow, serverStatus, setGoogleSyncEnabled } from "@/lib/api";

function Switch({ on, onChange }) {
  return <button type="button" role="switch" aria-checked={on} className={`switch ${on ? "switch--on" : ""}`} onClick={() => onChange(!on)}><i /></button>;
}

const Tag = ({ ok, children }) => <span className={`tag ${ok ? "tag--green" : "tag--red"}`} style={{ marginLeft: "auto" }}>{children}</span>;

const when = (ms) => {
  if (!ms) return "还没同步过";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "刚刚" : m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`;
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const demo = !!user?.demo;
  const { data: settings, set: saveSettings } = useCollection("settings");
  const app = settings.find((d) => d.id === "app") || {};
  const bedtime = app.bedtime || "22:30";
  const bedtimeOn = app.bedtimeOn !== false;

  const [server, setServer] = useState(null); // what the server has set up
  const [google, setGoogle] = useState(null); // { configured, connected, lastSync, lastError }
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    const r = new URLSearchParams(window.location.search).get("google");
    return r === "connected" ? "Google 日历已连接,正在第一次同步…" : r === "denied" ? "你没有允许访问 Google 日历。" : r === "failed" ? "连接 Google 日历没成功,请再试一次。" : "";
  });

  const refresh = async () => {
    const g = await googleStatus().catch(() => null);
    if (g) setGoogle(g);
    return g;
  };

  useEffect(() => {
    if (demo || !user) return undefined;
    let alive = true;
    serverStatus().then((v) => alive && setServer(v)).catch(() => {});
    googleStatus().then(async (g) => {
      if (!alive) return;
      setGoogle(g);
      if (g.connected && new URLSearchParams(window.location.search).get("google") === "connected") {
        setGoogleSyncEnabled(true);
        const out = await googleSyncNow().catch(() => null);
        if (!alive) return;
        setMessage(out?.ok ? `第一次同步完成:发送 ${out.pushed} 个,收到 ${out.imported} 个。` : `同步没成功:${out?.error || "出错了"}`);
        googleStatus().then((v) => alive && setGoogle(v)).catch(() => {});
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [demo, user]);

  const connect = async () => {
    setBusy("connect");
    const res = await googleConnect().catch((e) => ({ error: e.message }));
    if (!res.url) { setMessage(res.error || "没能开始连接"); setBusy(""); }
  };
  const syncNow = async () => {
    setBusy("sync");
    const out = await googleSyncNow().catch((e) => ({ ok: false, error: e.message }));
    setMessage(out.ok ? (out.skipped ? "另一次同步正在进行。" : `同步完成:发送 ${out.pushed} · 收到 ${out.imported + out.pulled} · 删除 ${out.deleted}`) : `同步没成功:${out.error}`);
    await refresh();
    setBusy("");
  };
  const disconnect = async () => {
    setBusy("disconnect");
    await googleDisconnect().catch(() => {});
    setGoogleSyncEnabled(false);
    setMessage("已断开。两边已有的日程都保留着。");
    await refresh();
    setBusy("");
  };

  const gc = demo ? { configured: true, connected: false } : google;

  return (
    <>
      <TopBar title="设置">
        <button type="button" className="icon-btn" onClick={() => router.back()} aria-label="返回"><ArrowLeft size={22} /></button>
      </TopBar>

      {message && <div className="notice" style={{ marginBottom: 12 }}>{message}</div>}

      <div className="card">
        <div className="set-head">
          <CalendarDays size={20} /> <b>Google 日历</b>
          {demo ? <span className="tag" style={{ marginLeft: "auto" }}>演示</span> : gc ? <Tag ok={gc.connected}>{gc.connected ? "已连接" : gc.configured ? "未连接" : "服务器未配置"}</Tag> : null}
        </div>
        <div className="set-note" style={{ marginTop: 0 }}>
          双向同步:App 里的日程和「有日期又有时间」的待办会变成 Google 日历里的时间块;在 Google 日历里新建、修改、删除的,也会同步回来。两边同时改了同一条时,以 App 为准。
        </div>
        {demo && <div className="set-note">演示账号不能连接 Google。</div>}
        {!demo && gc && !gc.configured && <div className="set-note">需要先在服务器设置 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET(README 里有步骤)。</div>}
        {!demo && gc?.connected && (
          <div className="set-note">上次同步:{when(gc.lastSync)}{gc.lastError ? <span style={{ color: "var(--red)" }}> · 出错:{gc.lastError}</span> : null}</div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          {!demo && gc?.configured && !gc.connected && (
            <button type="button" className="btn" onClick={connect} disabled={!!busy}>{busy === "connect" ? <Loader2 size={16} className="spin" /> : null} 连接 Google 日历</button>
          )}
          {!demo && gc?.connected && (
            <>
              <button type="button" className="btn btn--tonal" onClick={syncNow} disabled={!!busy}>{busy === "sync" ? <Loader2 size={16} className="spin" /> : null} 立即同步</button>
              <button type="button" className="btn btn--text" onClick={disconnect} disabled={!!busy}>断开连接</button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="set-head"><MoonStar size={20} /> <b>睡前整理</b></div>
        <div className="set-row"><span className="grow">每晚提醒我整理倒出箱</span><Switch on={bedtimeOn} onChange={(v) => saveSettings("app", { bedtimeOn: v })} /></div>
        <div className="set-row">
          <span className="grow">提醒时间</span>
          <input className="input input--plain" style={{ width: 150 }} type="time" value={bedtime} onChange={(e) => e.target.value && saveSettings("app", { bedtime: e.target.value })} />
        </div>
        <div className="set-note">时间一到,Telegram 机器人会告诉你还有几条没整理(倒出箱是空的就不打扰你)。</div>
      </div>

      <div className="card">
        <div className="set-head">
          <BookOpen size={20} /> <b>Notion</b>
          {demo ? <span className="tag tag--green">Idea Vault</span> : server ? <Tag ok={server.notion}>{server.notion ? "Idea Vault 已连接" : "未配置"}</Tag> : null}
        </div>
        <div className="set-note" style={{ marginTop: 0 }}>日记:每一篇都会自动存进 Idea Vault。<br />倒出箱:放进「想法 / 笔记 / 链接」文件夹的内容存进 Notion,存完仍然留在 App 里,方便回看。<br />记忆库留在 Notion 里,不需要在这里打开。</div>
      </div>

      <div className="card">
        <div className="set-head">
          <Send size={20} /> <b>Telegram</b>
          {demo ? <span className="tag tag--green">@garysecondbrain_bot</span> : server ? <Tag ok={server.telegram}>{server.telegram ? "机器人已连接" : "未配置"}</Tag> : null}
        </div>
        <div className="set-note" style={{ marginTop: 0 }}>给机器人发文字、链接、照片或语音,都会先进「倒出」,不会直接存进 Notion。语音会自动转成文字{server && !server.groq ? "(需要配置 GROQ_API_KEY)" : ""}。</div>
      </div>

      <div className="card">
        <div className="set-head"><b>倒出的系统文件夹</b></div>
        <div className="set-cats">
          {DUMP_CATEGORIES.map((c) => <div key={c.id} className="set-cat"><b>{c.cn}</b><span className="muted">→ {c.to}</span></div>)}
        </div>
        <div className="set-note">你也可以在「倒出 → 文件夹」里新建自己的文件夹(只放在 App 里)。</div>
      </div>

      <div className="card">
        <div className="set-row"><span className="grow">{user?.displayName || user?.email || "已登录"}</span></div>
        <button type="button" className="btn btn--outline btn--block" onClick={logout}><LogOut size={16} /> {demo ? "退出演示" : "退出登录"}</button>
      </div>
      <div style={{ height: 24 }} />
    </>
  );
}
