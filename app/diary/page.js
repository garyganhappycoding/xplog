"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { TopBar, Sheet, ConfirmDialog } from "@/components/ui";
import { useCollection } from "@/lib/useCollection";
import { useAuth } from "@/context/AuthContext";
import { syncToNotion } from "@/lib/api";
import { weekdayName } from "@/lib/items";
import { addDays, isSameDay } from "@/lib/date";

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (isSameDay(d, today)) return "今天";
  if (isSameDay(d, addDays(today, -1))) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayName(d)}`;
}
const hhmm = (ts) => new Date(ts).toTimeString().slice(0, 5);

// Every diary entry goes to the Notion Idea Vault by itself; the server records the result on the entry.
function SyncChip({ entry, onRetry }) {
  if (entry.notionState === "pending" || entry.notionPageId === "pending") return <span className="sync sync--busy"><Loader2 size={13} className="spin" /> 正在同步到 Notion…</span>;
  if (entry.notionState === "error") return <button type="button" className="sync sync--bad" title={entry.notionError || ""} onClick={(e) => { e.stopPropagation(); onRetry(entry); }}><RefreshCw size={13} /> 没同步成功 · 重试</button>;
  if (entry.notionPageId) return <span className="sync sync--ok"><CheckCircle2 size={13} /> 已同步到 Notion Idea Vault</span>;
  return <button type="button" className="sync sync--bad" onClick={(e) => { e.stopPropagation(); onRetry(entry); }}><RefreshCw size={13} /> 还没同步 · 重试</button>;
}

export default function DiaryPage() {
  const { data, add, update, remove } = useCollection("diaryEntries", "createdAt");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [askDelete, setAskDelete] = useState(false);

  const { user } = useAuth();
  const demo = !!user?.demo;

  // Sends the entry to Notion (the demo only pretends). The server marks it ok / error on the entry.
  const pushToNotion = async (id) => {
    await update(id, { notionState: "pending", notionError: null }).catch(() => {});
    if (demo) { setTimeout(() => update(id, { notionState: "ok", notionPageId: "demo" }), 1200); return; }
    const res = await syncToNotion({ collection: "diaryEntries", id });
    if (!res.ok && !res.error) await update(id, { notionState: "error", notionError: "没连上服务器" }).catch(() => {});
  };

  const save = async () => {
    const v = text.trim();
    if (!v) return;
    const ref = await add({ text: v, createdAt: Date.now(), from: "web", notionPageId: null, notionState: "pending" });
    setText("");
    if (ref?.id) pushToNotion(ref.id);
  };

  const groups = useMemo(() => {
    const out = [];
    for (const e of [...data].sort((a, b) => b.createdAt - a.createdAt)) {
      const label = dayLabel(e.createdAt);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [data]);

  return (
    <>
      <TopBar title="日记" sub="写下来的每一篇,都会自动存进 Notion" />

      <div className="composer">
        <textarea className="textarea composer__input" rows={4} placeholder="今天过得怎么样?想到什么就写什么…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="composer__bar">
          <span className="muted" style={{ fontSize: 12 }}>{text.trim().length > 0 ? `${text.trim().length} 字` : "自由书写,没有格式"}</span>
          <span className="grow" />
          <button type="button" className="btn" onClick={save} disabled={!text.trim()}>保存</button>
        </div>
      </div>

      {groups.length === 0 && <div className="empty">还没有日记。写下今天的第一篇吧。</div>}
      {groups.map((g) => (
        <section key={g.label}>
          <div className="section-title">{g.label}</div>
          {g.items.map((e) => (
            <article key={e.id} className="card entry" onClick={() => { setEditing(e); setDraft(e.text); }}>
              <div className="entry__time">{hhmm(e.createdAt)}</div>
              <p className="entry__text">{e.text}</p>
              <SyncChip entry={e} onRetry={(x) => pushToNotion(x.id)} />
            </article>
          ))}
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="编辑日记">
        <textarea className="textarea" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="sheet__actions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn--text" style={{ color: "var(--red)" }} onClick={() => setAskDelete(true)}>删除</button>
          <div className="row">
            <button type="button" className="btn btn--text" onClick={() => setEditing(null)}>取消</button>
            <button type="button" className="btn" disabled={!draft.trim()} onClick={async () => { const id = editing.id; await update(id, { text: draft.trim() }); setEditing(null); pushToNotion(id); }}>保存</button>
          </div>
        </div>
      </Sheet>
      <ConfirmDialog open={askDelete} title="删除这篇日记?" message="Notion 里已同步的那一份不会被删除(要删请在 Notion 里删)。" onCancel={() => setAskDelete(false)} onConfirm={async () => { await remove(editing.id); setAskDelete(false); setEditing(null); }} />
    </>
  );
}
