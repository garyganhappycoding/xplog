"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, CalendarPlus, Check, CheckSquare, Folder, FolderInput, FolderPlus, Image as ImageIcon, Lightbulb,
  Link2, Loader2, Mic, MoonStar, Pencil, Play, Plus, Send, SkipForward, StickyNote, Trash2, Undo2, X,
} from "lucide-react";
import { TopBar, Sheet, ConfirmDialog } from "@/components/ui";
import CreateSheet from "@/components/CreateSheet";
import { useCollection } from "@/lib/useCollection";
import { useAuth } from "@/context/AuthContext";
import { authedFetch, syncToNotion } from "@/lib/api";
import { prepareImage, recorderMime, uploadBlob } from "@/lib/media";
import { COLORS } from "@/lib/demo";
import { allFolders, ago, folderOf, stamp } from "@/lib/items";

const ICONS = { CheckSquare, CalendarPlus, BookOpen, Lightbulb, StickyNote, Link2, Folder };
const KIND = { text: "文字", link: "链接", photo: "照片", voice: "语音" };
const FOLDER_COLORS = [COLORS.blueberry, COLORS.tangerine, COLORS.sage, COLORS.grape, COLORS.peacock, COLORS.flamingo, COLORS.banana, COLORS.graphite];
const NOTION_FOLDERS = ["idea", "note", "link"];
const URL_RE = /https?:\/\/[^\s]+/;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function FolderIcon({ f, size = 40 }) {
  const Icon = ICONS[f.icon] || Folder;
  return <span className="ficon" style={{ width: size, height: size, background: `${f.color}22`, color: f.color }}><Icon size={size * 0.52} /></span>;
}

// Photos and voice notes from Telegram are served through a signed link (the bot token stays on the server).
const tgUrl = (d) => (d.tgFileId && d.fileSig ? `/api/tg-file?id=${encodeURIComponent(d.tgFileId)}&sig=${d.fileSig}` : null);

function DumpBody({ d }) {
  const photo = d.photoUrl || (d.kind === "photo" ? tgUrl(d) : null);
  const audio = d.audioUrl || (d.kind === "voice" ? tgUrl(d) : null);
  return (
    <>
      {d.kind === "photo" && (
        photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="dump__photo" src={photo} alt="" loading="lazy" />
          : <div className="dump__photo dump__photo--ph" style={{ background: d.photoColor || "#e8eaed" }}><ImageIcon size={28} color="#fff" /></div>
      )}
      {d.kind === "voice" && (audio
        ? <audio className="dump__audio" controls preload="none" src={audio} />
        : <div className="dump__voice"><Play size={16} fill="currentColor" /><i /><span>{mmss(d.seconds || 0)}</span></div>)}
      {d.text && <div className="dump__text">{d.text}</div>}
      {d.url && <a className="dump__link" href={d.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Link2 size={14} /> {host(d.url)}</a>}
    </>
  );
}

// Pick a folder (or make a new one) for one or several dumps.
function FolderPicker({ folders, title, noEvent, onPick, onCreate, onClose }) {
  const [name, setName] = useState("");
  const create = async () => {
    const v = name.trim();
    if (!v) return;
    const id = await onCreate(v);
    setName("");
    if (id) onPick(id);
  };
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="pick">
        {folders.map((f) => {
          const disabled = noEvent && f.id === "event";
          return (
            <button key={f.id} type="button" className="pick__row" disabled={disabled} onClick={() => onPick(f.id)}>
              <FolderIcon f={f} size={36} />
              <span className="grow"><b>{f.cn}</b><small>{disabled ? "要逐条设时间,请单独放" : f.to}</small></span>
            </button>
          );
        })}
      </div>
      <div className="quick" style={{ padding: "12px 0 0" }}>
        <input className="input" placeholder="新建文件夹,例如「旅行计划」" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button type="button" className="btn" disabled={!name.trim()} onClick={create}>新建</button>
      </div>
    </Sheet>
  );
}

// "Before sleep" mode: one card at a time, tap a folder.
function Review({ items, folders, onPick, onClose, onRemove }) {
  const [queue] = useState(() => [...items].reverse()); // snapshot, so cards do not vanish while sorting
  const [i, setI] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const d = queue[i];
  const next = () => setI((n) => n + 1);
  return (
    <div className="review">
      <div className="review__top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭"><X size={22} /></button>
        <div className="review__count">{d ? `${i + 1} / ${queue.length}` : "完成"}</div>
        <span style={{ width: 44 }} />
      </div>
      <div className="review__bar"><i style={{ width: `${(Math.min(i, queue.length) / Math.max(queue.length, 1)) * 100}%` }} /></div>
      {d ? (
        <>
          <div className="review__card">
            <div className="dump__meta">{KIND[d.kind]} · {d.source === "telegram" ? "Telegram" : "网页"} · {ago(d.createdAt)}</div>
            <DumpBody d={d} />
          </div>
          <div className="review__ask">放进哪个文件夹?</div>
          <div className="review__grid">
            {folders.map((f) => {
              const Icon = ICONS[f.icon] || Folder;
              return (
                <button key={f.id} type="button" className={`cat ${d.suggested === f.id ? "cat--suggested" : ""}`} onClick={async () => { await onPick(d, f.id); next(); }}>
                  <Icon size={22} style={{ color: f.color }} />
                  <b>{f.cn}</b>
                  {d.suggested === f.id && <small>建议</small>}
                </button>
              );
            })}
          </div>
          <div className="review__foot">
            <button type="button" className="btn btn--text" onClick={() => { setSkipped((n) => n + 1); next(); }}><SkipForward size={16} /> 先跳过</button>
            <button type="button" className="btn btn--text" style={{ color: "var(--red)" }} onClick={async () => { await onRemove(d); next(); }}><Trash2 size={16} /> 删除</button>
          </div>
        </>
      ) : (
        <div className="review__done">
          <div className="review__moon"><MoonStar size={44} /></div>
          <h2>{skipped ? "这一轮整理完了" : "整理完了"}</h2>
          <p className="muted">{skipped ? `还有 ${skipped} 条先跳过的,留在「收件箱」里。晚安 🌙` : "脑子清空了,可以安心睡了。晚安 🌙"}</p>
          <button type="button" className="btn btn--lg" onClick={onClose}>好的</button>
        </div>
      )}
    </div>
  );
}

export default function DumpPage() {
  const { data: dumps, loading, add, update, remove } = useCollection("dumps");
  const { data: customFolders, add: addFolder, update: updateFolder, remove: removeFolder } = useCollection("dumpFolders");
  const { add: addTodo } = useCollection("todos");
  const { add: addDiary, update: updateDiary } = useCollection("diaryEntries");
  const { data: projects } = useCollection("projects");
  const { user } = useAuth();
  const demo = !!user?.demo;
  const recorder = useRef(null);
  const chunks = useRef([]);
  const startedAt = useRef(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [text, setText] = useState("");
  const [tab, setTab] = useState("inbox");
  const [openFolder, setOpenFolder] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]);
  const [moveIds, setMoveIds] = useState(null); // dumps waiting for a folder choice
  const [review, setReview] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("review") === "1");
  const [eventFor, setEventFor] = useState(null);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [recording, setRecording] = useState(0);
  const timer = useRef(null);
  const fileInput = useRef(null);

  const folders = allFolders(customFolders);
  const folderById = (id) => folders.find((f) => f.id === id);
  const fresh = dumps.filter((d) => d.status === "new").sort((a, b) => b.createdAt - a.createdAt);
  const sorted = dumps.filter((d) => d.status === "sorted");
  const inFolder = (id) => sorted.filter((d) => folderOf(d) === id).sort((a, b) => (b.sortedAt || 0) - (a.sortedAt || 0));
  const current = openFolder ? folderById(openFolder) : null;

  useEffect(() => () => clearInterval(timer.current), []);

  // ---- adding ---------------------------------------------------------------------------------------
  const backToInbox = () => { setTab("inbox"); setOpenFolder(null); };
  const send = async () => {
    const v = text.trim();
    if (!v) return;
    const url = v.match(URL_RE)?.[0];
    await add({ kind: url ? "link" : "text", source: "web", text: url ? v.replace(url, "").trim() || host(url) : v, url: url || null, createdAt: Date.now(), status: "new", suggested: url ? "link" : null });
    setText("");
    backToInbox();
  };
  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setNotice("");
    setBusy("正在处理照片…");
    try {
      const media = demo ? { photoUrl: URL.createObjectURL(f) } : await prepareImage(user.uid, f);
      await add({ kind: "photo", source: "web", text: text.trim(), ...media, createdAt: Date.now(), status: "new", suggested: "note" });
      setText("");
      backToInbox();
    } catch (err) {
      setNotice(`照片没能保存:${err.message || "出错了"}`);
    } finally {
      setBusy("");
    }
  };

  const saveVoice = async (blob, seconds) => {
    setBusy("正在把语音转成文字…");
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", blob, `voice.${ext}`);
      const [audioUrl, said] = await Promise.all([
        uploadBlob(user.uid, "dump-voice", blob, ext),
        authedFetch("/api/transcribe", { method: "POST", body: form }).then(async (r) => {
          const out = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(out.error || `转文字失败(${r.status})`);
          return out.text || "";
        }).catch((err) => { setNotice(`${err.message}。录音已保存,但没有文字。`); return ""; }),
      ]);
      await add({ kind: "voice", source: "web", text: said, seconds, audioUrl: audioUrl || null, createdAt: Date.now(), status: "new", suggested: null });
      backToInbox();
    } finally {
      setBusy("");
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      clearInterval(timer.current);
      if (demo) {
        const seconds = recording;
        setRecording(0);
        await add({ kind: "voice", source: "web", text: "(语音转文字会显示在这里)", seconds, createdAt: Date.now(), status: "new", suggested: null });
        backToInbox();
      } else {
        recorder.current?.stop(); // its onstop handler saves the recording
      }
      return;
    }
    setNotice("");
    if (!demo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = recorderMime();
        const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunks.current = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const seconds = Math.max(1, Math.round((stamp() - startedAt.current) / 1000));
          setRecording(0);
          saveVoice(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }), seconds);
        };
        recorder.current = rec;
        startedAt.current = stamp();
        rec.start();
      } catch {
        setNotice("用不了麦克风。请在浏览器的网站设置里允许录音。");
        return;
      }
    }
    setRecording(1);
    timer.current = setInterval(() => setRecording((n) => n + 1), 1000);
  };

  // ---- filing ---------------------------------------------------------------------------------------
  const finish = (d, folder) => update(d.id, { status: "sorted", folder, sortedAt: stamp() });

  // Notion: the server writes the page, then records notionPageId / notionState on the document.
  // (The demo only pretends.)
  const toNotion = async (collection, id, folder) => {
    await update(id, { notionState: "pending", notionError: null }).catch(() => {});
    if (demo) { setTimeout(() => update(id, { notionState: "ok", notionPageId: "demo" }), 1200); return; }
    const res = await syncToNotion({ collection, id, folder });
    if (!res.ok && !res.error) await update(id, { notionState: "error", notionError: "没连上服务器" }).catch(() => {});
  };

  const fileTo = async (d, folder) => {
    if (d.status === "new") {
      // the first time an item is filed into a system folder it also goes where that folder points
      if (folder === "event") { setEventFor(d); return; }
      if (folder === "todo") {
        const inbox = projects.find((p) => p.name === "收件箱") || projects[0];
        await addTodo({ projectId: inbox?.id || "", sectionId: null, text: d.text || host(d.url || ""), done: false, createdAt: stamp(), order: stamp(), doDate: null, dueDate: null, startTime: null, endTime: null });
      }
      if (folder === "diary") {
        const entry = await addDiary({ text: d.text, createdAt: stamp(), from: "dump", notionPageId: null, notionState: "pending", ...(d.photoUrl ? { photoUrl: d.photoUrl } : {}) });
        await finish(d, folder);
        if (demo) setTimeout(() => updateDiary(entry.id, { notionState: "ok", notionPageId: "demo" }), 1200);
        else syncToNotion({ collection: "diaryEntries", id: entry.id });
        return;
      }
    }
    await finish(d, folder);
    if (NOTION_FOLDERS.includes(folder)) await toNotion("dumps", d.id, folder);
  };
  const createFolder = async (name) => {
    const ref = await addFolder({ name, color: FOLDER_COLORS[customFolders.length % FOLDER_COLORS.length], order: stamp() });
    return ref?.id;
  };
  const pickForMove = async (folder) => {
    const ids = moveIds;
    setMoveIds(null);
    for (const id of ids) {
      const d = dumps.find((x) => x.id === id);
      if (d) await fileTo(d, folder);
    }
    setSelecting(false);
    setPicked([]);
  };
  const putBack = (d) => update(d.id, { status: "new", folder: null, sortedAt: null });
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const stopSelecting = () => { setSelecting(false); setPicked([]); };

  const deleteFolder = async () => {
    for (const d of inFolder(current.id)) await putBack(d);
    await removeFolder(current.id);
    setAskDelete(false);
    setOpenFolder(null);
  };
  const saveRename = async () => {
    const v = folderName.trim();
    if (v) await updateFolder(current.id, { name: v });
    setRenaming(false);
  };

  // ---- pieces ----------------------------------------------------------------------------------------
  const card = (d, children) => (
    <div key={d.id} className={`card dump ${selecting && picked.includes(d.id) ? "dump--picked" : ""}`} onClick={selecting ? () => togglePick(d.id) : undefined}>
      <div className="dump__meta">
        {selecting && <span className={`pickbox ${picked.includes(d.id) ? "pickbox--on" : ""}`}>{picked.includes(d.id) && <Check size={14} strokeWidth={3} />}</span>}
        {KIND[d.kind]} · {d.source === "telegram" ? "Telegram" : "网页"} · {ago(d.createdAt)}
        {!selecting && d.status === "new" && <button type="button" className="dump__x" onClick={() => remove(d.id)} aria-label="删除"><X size={16} /></button>}
      </div>
      <DumpBody d={d} />
      {children}
    </div>
  );

  const notionChip = (d) => {
    if (d.status !== "sorted") return null;
    const f = folderOf(d);
    if (d.notionState === "pending") return <span className="sync sync--busy"><Loader2 size={13} className="spin" /> 正在存到 Notion…</span>;
    if (d.notionState === "error") return <button type="button" className="sync sync--bad" title={d.notionError || ""} onClick={() => toNotion("dumps", d.id, f)}>⚠ 没存进 Notion · 重试</button>;
    if (d.notionPageId) return <a className="sync sync--ok" href={d.notionUrl || undefined} target="_blank" rel="noreferrer"><Check size={13} /> 已存到 Notion</a>;
    if (f === "todo") return <span className="sync sync--ok"><Check size={13} /> 已加到待办</span>;
    if (f === "event") return <span className="sync sync--ok"><Check size={13} /> 已加到日历</span>;
    if (f === "diary") return <span className="sync sync--ok"><Check size={13} /> 已存进日记(日记会同步到 Notion)</span>;
    return null;
  };

  const folderChips = (d) => {
    const order = [...folders].sort((a, b) => (b.id === d.suggested) - (a.id === d.suggested));
    return (
      <div className="fchips">
        <span className="fchips__label">放进</span>
        {order.map((f) => (
          <button key={f.id} type="button" className={`fchip ${f.id === d.suggested ? "fchip--sugg" : ""}`} onClick={() => fileTo(d, f.id)}>
            <span className="dot" style={{ background: f.color }} /> {f.cn}{f.id === d.suggested && <small>建议</small>}
          </button>
        ))}
      </div>
    );
  };

  const overlays = (
    <>
      {moveIds && (
        <FolderPicker folders={folders} title={`移 ${moveIds.length} 条到…`} noEvent={moveIds.length > 1} onPick={pickForMove} onCreate={createFolder} onClose={() => setMoveIds(null)} />
      )}
      {eventFor && <CreateSheet key={eventFor.id} initial={{ kind: "event", title: eventFor.text }} onSaved={() => finish(eventFor, "event")} onClose={() => setEventFor(null)} />}
    </>
  );

  // ---- a folder opened ----------------------------------------------------------------------------------
  if (current) {
    const items = inFolder(current.id);
    return (
      <>
        <TopBar title={current.cn} sub={`${items.length} 项 · ${current.to}`}>
          <button type="button" className="icon-btn" onClick={() => setOpenFolder(null)} aria-label="返回"><ArrowLeft size={22} /></button>
          {!current.system && <button type="button" className="icon-btn" onClick={() => { setFolderName(current.cn); setRenaming(true); }} aria-label="改名"><Pencil size={20} /></button>}
          {!current.system && <button type="button" className="icon-btn" onClick={() => setAskDelete(true)} aria-label="删除文件夹"><Trash2 size={20} /></button>}
        </TopBar>
        {items.length === 0 ? <div className="empty">这个文件夹是空的<br />在收件箱里点「放进 {current.cn}」就会出现在这里</div> : items.map((d) => card(d, (
          <div className="dump__acts">
            {notionChip(d)}
            <button type="button" className="btn btn--text btn--sm" onClick={() => setMoveIds([d.id])}><FolderInput size={16} /> 移到…</button>
            <button type="button" className="btn btn--text btn--sm" onClick={() => putBack(d)}><Undo2 size={16} /> 放回收件箱</button>
          </div>
        )))}
        {overlays}
        <Sheet open={renaming} onClose={() => setRenaming(false)} title="文件夹改名">
          <input className="input" autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRename()} />
          <div className="sheet__actions"><button type="button" className="btn btn--text" onClick={() => setRenaming(false)}>取消</button><button type="button" className="btn" onClick={saveRename}>保存</button></div>
        </Sheet>
        <ConfirmDialog open={askDelete} title={`删除文件夹「${current.cn}」?`} message={`里面的 ${items.length} 项不会被删除,会放回收件箱。`} onConfirm={deleteFolder} onCancel={() => setAskDelete(false)} />
      </>
    );
  }

  return (
    <>
      <TopBar title="倒出" sub="先丢进来,再放进文件夹">
        {tab === "inbox" && fresh.length > 0 && !selecting && <button type="button" className="btn btn--tonal btn--sm" onClick={() => setReview(true)}><MoonStar size={16} /> 睡前整理</button>}
      </TopBar>

      <div className="composer">
        <textarea className="textarea composer__input" rows={3} placeholder="想到什么,直接倒出来… 可以是想法、待办、链接" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="composer__bar">
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />
          <button type="button" className="icon-btn" onClick={() => fileInput.current?.click()} aria-label="照片"><ImageIcon size={22} /></button>
          <button type="button" className={`icon-btn ${recording ? "icon-btn--rec" : ""}`} onClick={toggleRecord} aria-label="语音"><Mic size={22} /></button>
          {recording > 0 && <span className="rec">● 录音中 {mmss(recording)} · 再点一下结束</span>}
          <span className="grow" />
          <button type="button" className="btn" onClick={send} disabled={!text.trim()}><Send size={16} /> 倒进去</button>
        </div>
      </div>

      {(notice || busy) && <div className={`notice ${busy ? "notice--busy" : ""}`}>{busy ? <><Loader2 size={14} className="spin" /> {busy}</> : notice}</div>}

      <div className="tabs">
        <button type="button" className={`tabs__item ${tab === "inbox" ? "tabs__item--on" : ""}`} onClick={() => setTab("inbox")}>收件箱 <b>{fresh.length}</b></button>
        <button type="button" className={`tabs__item ${tab === "folders" ? "tabs__item--on" : ""}`} onClick={() => { setTab("folders"); stopSelecting(); }}>文件夹 <b>{folders.length}</b></button>
      </div>

      {tab === "inbox" ? (
        fresh.length === 0 ? <div className="empty">收件箱是空的 ✓<br />从 Telegram 发给机器人的内容也会出现在这里</div> : (
          <>
            <div className="inbox-head">
              <span className="muted"><MoonStar size={14} style={{ verticalAlign: "-2px" }} /> 每晚 22:30 提醒你整理</span>
              <button type="button" className="btn btn--text btn--sm" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>{selecting ? "取消选择" : "选择多条"}</button>
            </div>
            {fresh.map((d) => card(d, selecting ? null : folderChips(d)))}
            {selecting && (
              <div className="selbar">
                <button type="button" className="btn btn--text" onClick={() => setPicked(picked.length === fresh.length ? [] : fresh.map((d) => d.id))}>{picked.length === fresh.length ? "全不选" : "全选"}</button>
                <span className="grow muted">已选 {picked.length} 条</span>
                <button type="button" className="btn" disabled={picked.length === 0} onClick={() => setMoveIds(picked)}><FolderInput size={16} /> 移到…</button>
              </div>
            )}
          </>
        )
      ) : (
        <div className="ftiles">
          {folders.map((f) => (
            <button key={f.id} type="button" className="ftile" onClick={() => setOpenFolder(f.id)}>
              <FolderIcon f={f} />
              <b>{f.cn}</b>
              <span className="muted">{inFolder(f.id).length} 项</span>
              <small>{f.system ? f.to : "自己的文件夹"}</small>
            </button>
          ))}
          <button type="button" className="ftile ftile--new" onClick={() => { setFolderName(""); setNewFolder(true); }}>
            <span className="ficon" style={{ width: 40, height: 40, background: "var(--surface-2)", color: "var(--text-2)" }}><FolderPlus size={21} /></span>
            <b>新建文件夹</b>
          </button>
        </div>
      )}

      {overlays}

      <Sheet open={newFolder} onClose={() => setNewFolder(false)} title="新建文件夹">
        <input className="input" autoFocus placeholder="例如:旅行计划、学习资料、食谱" value={folderName} onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={async (e) => { if (e.key === "Enter" && folderName.trim()) { await createFolder(folderName.trim()); setNewFolder(false); } }} />
        <div className="sheet__actions">
          <button type="button" className="btn btn--text" onClick={() => setNewFolder(false)}>取消</button>
          <button type="button" className="btn" disabled={!folderName.trim()} onClick={async () => { await createFolder(folderName.trim()); setNewFolder(false); }}><Plus size={16} /> 创建</button>
        </div>
      </Sheet>

      {review && !loading && <Review items={fresh} folders={folders} onPick={fileTo} onRemove={(d) => remove(d.id)} onClose={() => setReview(false)} />}
    </>
  );
}
