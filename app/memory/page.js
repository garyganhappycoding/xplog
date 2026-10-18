"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ui";
import ExpandableText from "@/components/ExpandableText";

// Mirrors lib/server/memory.js LEVELS (that file is server-only).
const LEVELS = [
  { key: "trivia", name: "琐碎事情", hint: "随手记下的小事:价格、看到的食物…" },
  { key: "thought", name: "思考过的事情", hint: "想过、整理过的想法" },
  { key: "output", name: "准备输出的事情", hint: "打算发布/分享的内容" },
];
const FILTERS = [{ key: "all", name: "全部" }, ...LEVELS, { key: "none", name: "未分级" }];

export default function MemoryPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState({ level: "all", q: "" });
  const [searchText, setSearchText] = useState("");
  const [state, setState] = useState({ items: [], cursor: null, loading: true, error: "" });
  const [loadingMore, setLoadingMore] = useState(false);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newLevel, setNewLevel] = useState("trivia");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  // Every call carries the signed-in user's Firebase token; the server only lets the owner in.
  const api = async (path, options = {}) => {
    const token = user?.getIdToken ? await user.getIdToken() : "";
    const res = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  };

  const listUrl = (cursor) => {
    const sp = new URLSearchParams();
    if (filter.level !== "all") sp.set("level", filter.level);
    if (filter.q) sp.set("q", filter.q);
    if (cursor) sp.set("cursor", cursor);
    return `/api/memory?${sp}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api(listUrl());
        if (!cancelled) setState({ items: data.items, cursor: data.nextCursor, loading: false, error: "" });
      } catch (e) {
        if (!cancelled) setState({ items: [], cursor: null, loading: false, error: e.message });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, user]);

  const changeFilter = (next) => {
    setState((s) => ({ ...s, loading: true }));
    setFilter(next);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api(listUrl(state.cursor));
      setState((s) => ({ ...s, items: [...s.items, ...data.items], cursor: data.nextCursor }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
    setLoadingMore(false);
  };

  const submitAsk = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await api("/api/ask", { method: "POST", body: JSON.stringify({ question }) }));
    } catch (e) {
      setAnswer({ answer: `⚠️ ${e.message}`, sources: [] });
    }
    setAsking(false);
  };

  const submitAdd = async () => {
    if (!newText.trim() || saving) return;
    setSaving(true);
    try {
      const { item } = await api("/api/memory", { method: "POST", body: JSON.stringify({ text: newText, level: newLevel }) });
      setNewText("");
      setShowAdd(false);
      const matches = filter.level === "all" || filter.level === newLevel;
      if (matches && !filter.q) setState((s) => ({ ...s, items: [item, ...s.items] }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
    setSaving(false);
  };

  const moveTo = async (item, level) => {
    try {
      const { item: updated } = await api("/api/memory", { method: "PATCH", body: JSON.stringify({ id: item.id, level }) });
      setState((s) => ({
        ...s,
        items: s.items
          .map((x) => (x.id === item.id ? updated : x))
          .filter((x) => filter.level === "all" || x.level === FILTERS.find((f) => f.key === filter.level)?.name),
      }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api(`/api/memory?id=${target.id}`, { method: "DELETE" });
      setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== target.id) }));
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这条记录?"
        message={deleteTarget ? `「${deleteTarget.title.slice(0, 30)}」会被移到 Notion 的回收站(30 天内可在 Notion 里恢复)。` : ""}
        confirmLabel="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="xl-header"><div className="xl-title">记忆库</div></div>
      <div className="xl-subtitle" style={{ marginBottom: 16 }}>
        在 Telegram 里发给机器人的内容都存在 Notion,这里是回看的地方。可以按层级整理,也可以直接提问。
      </div>

      <div className="xl-panel">
        <label className="xl-label">问问记忆库</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="xl-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitAsk(); }}
            placeholder="例如:鸡饭多少钱?上次在哪里吃的?"
          />
          <button className="xl-btn" style={{ padding: "0 18px", flexShrink: 0 }} onClick={submitAsk} disabled={asking} type="button">
            <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{asking ? "查找中…" : "提问"}
          </button>
        </div>
        {answer && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              ["1  总结 Summary", <div key="s" className="xl-entry__text" style={{ opacity: 1, fontWeight: 600 }}>{answer.summary || answer.answer}</div>],
              ["2  详细 Details", <div key="d" className="xl-entry__text" style={{ whiteSpace: "pre-wrap", opacity: 1 }}>{answer.details || "—"}</div>],
              [`3  来源 Sources${answer.answered === false && answer.sources?.length ? "(相关记录,仅供参考)" : ""}`,
                answer.sources?.length ? (
                  <div key="src" className="xl-entry__text" style={{ opacity: 1 }}>
                    {answer.sources.map((s, i) => (
                      <div key={s.id || i}>
                        {i + 1}. {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>{s.title}</a> : s.title}
                        {s.date ? ` (${s.date})` : ""}
                        {answer.answered === false && s.snippet && s.snippet !== s.title ? <span style={{ color: "var(--muted)" }}> — {s.snippet}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : <div key="src" className="xl-entry__text" style={{ opacity: 1 }}>—</div>],
              ["4  后续决策 Next steps",
                <div key="f" className="xl-entry__text" style={{ opacity: 1 }}>
                  {answer.followUp?.length ? answer.followUp.map((f, i) => <div key={i}>• {f}</div>) : "—"}
                </div>],
            ].map(([heading, body]) => (
              <div key={heading}>
                <div className="xl-label" style={{ color: "var(--gold-bright)", marginBottom: 4 }}>{heading}</div>
                {body}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="xl-pillrow" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`xl-pill xl-pill--sm ${filter.level === f.key ? "xl-pill--active" : ""}`} onClick={() => changeFilter({ ...filter, level: f.key })}>
            {f.name}
          </button>
        ))}
      </div>
      {LEVELS.find((l) => l.key === filter.level) && (
        <div className="xl-subtitle" style={{ marginTop: -4, marginBottom: 12 }}>{LEVELS.find((l) => l.key === filter.level).hint}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          className="xl-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") changeFilter({ ...filter, q: searchText.trim() }); }}
          placeholder="搜索标题和内容,回车确认"
        />
        <button className="xl-btn--ghost" style={{ flexShrink: 0 }} onClick={() => changeFilter({ ...filter, q: searchText.trim() })} type="button"><Search size={14} /></button>
        <button className="xl-btn--ghost" style={{ flexShrink: 0 }} onClick={() => setShowAdd((v) => !v)} type="button"><Plus size={14} style={{ verticalAlign: -2 }} /> 记一条</button>
      </div>

      {showAdd && (
        <div className="xl-panel">
          <textarea className="xl-input" value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="例如:鸡饭 RM8.50 @Kedai Ali #价格" style={{ minHeight: 90 }} autoFocus />
          <div className="xl-pillrow" style={{ margin: "12px 0" }}>
            {LEVELS.map((l) => (
              <button key={l.key} type="button" className={`xl-pill xl-pill--sm ${newLevel === l.key ? "xl-pill--active" : ""}`} onClick={() => setNewLevel(l.key)}>{l.name}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="xl-btn" onClick={submitAdd} disabled={saving} type="button">{saving ? "保存中…" : "保存到 Notion"}</button>
            <button className="xl-btn--ghost" onClick={() => setShowAdd(false)} type="button">取消</button>
          </div>
        </div>
      )}

      {state.error && <div className="xl-panel" style={{ color: "#C77A70" }}>{state.error}</div>}
      {state.loading && <div className="xl-subtitle">加载中…</div>}
      {!state.loading && !state.error && state.items.length === 0 && <div className="xl-subtitle">这里还没有内容。在 Telegram 里发 note: … 试试。</div>}

      {state.items.map((item) => (
        <div key={item.id} className="xl-entry">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>{item.title}</div>
            <div className="xl-entry__meta" style={{ flexShrink: 0 }}>{new Date(item.createdTime).toLocaleDateString("zh-CN")}</div>
          </div>
          {item.content && <div style={{ marginTop: 6 }}><ExpandableText text={item.content} /></div>}
          {item.photos.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {item.photos.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name || "photo"} style={{ maxHeight: 140, maxWidth: "100%", borderRadius: 4, border: "1px solid var(--hairline)" }} />
                </a>
              ))}
            </div>
          )}
          {item.tags.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {item.tags.map((t) => <span key={t} className="xl-topictag">#{t}</span>)}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <span className="xl-entry__meta">层级:</span>
            {LEVELS.map((l) => (
              <button key={l.key} type="button" className={`xl-pill xl-pill--sm ${item.level === l.name ? "xl-pill--active" : ""}`} onClick={() => item.level !== l.name && moveTo(item, l.key)}>
                {l.name}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <a className="xl-entry__iconbtn" href={item.url} target="_blank" rel="noreferrer" title="在 Notion 打开"><ExternalLink size={12} /></a>
              <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => setDeleteTarget(item)} type="button" title="删除"><Trash2 size={12} /></button>
            </span>
          </div>
        </div>
      ))}

      {state.cursor && (
        <button className="xl-btn--ghost" style={{ width: "100%" }} onClick={loadMore} disabled={loadingMore} type="button">
          {loadingMore ? "加载中…" : "加载更多"}
        </button>
      )}
    </>
  );
}
