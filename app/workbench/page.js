"use client";
import { useState } from "react";
import { Plus, Pencil, X as XIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useCollection } from "@/lib/useCollection";

const COLUMNS = [
  { status: "todo", cn: "待办", en: "TODO" },
  { status: "doing", cn: "进行中", en: "DOING" },
  { status: "done", cn: "完成", en: "DONE" },
];

export default function WorkbenchPage() {
  const { data: tasks, add, update, remove } = useCollection("tasks");

  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const submitNew = async () => {
    if (!newText.trim()) return;
    await add({ text: newText.trim(), status: "todo", createdAt: Date.now() });
    setNewText("");
    setShowAdd(false);
  };

  const startEdit = (t) => { setEditingId(t.id); setEditText(t.text); };
  const saveEdit = async (t) => {
    if (editText.trim()) await update(t.id, { text: editText.trim() });
    setEditingId(null);
  };

  const move = (t, dir) => {
    const idx = COLUMNS.findIndex((c) => c.status === t.status);
    const next = COLUMNS[idx + dir];
    if (next) update(t.id, { status: next.status });
  };

  return (
    <div style={{ position: "relative", minHeight: 440 }}>
      <div className="xl-header">
        <div>
          <div className="xl-title">工作台</div>
          <div className="xl-subtitle">待办事项,与技能 XP 无关,纯粹记录要做的事</div>
        </div>
      </div>

      {showAdd && (
        <div className="xl-panel">
          <div className="xl-field">
            <label className="xl-label">新任务</label>
            <textarea className="xl-input" value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="需要做什么?" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="xl-btn" onClick={submitNew} type="button">保存</button>
            <button className="xl-btn--ghost" onClick={() => setShowAdd(false)} type="button">取消</button>
          </div>
        </div>
      )}

      <div className="xl-kanban">
        {COLUMNS.map((col, colIdx) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status}>
              <div className="xl-kanban__head">{col.cn}</div>
              <div className="xl-kanban__sub">{col.en} · {colTasks.length}</div>
              {colTasks.map((t) => (
                <div className="xl-entry" key={t.id} style={{ padding: "12px 14px" }}>
                  {editingId === t.id ? (
                    <div>
                      <textarea
                        className="xl-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{ minHeight: 50, marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveEdit(t)} type="button">保存</button>
                        <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingId(null)} type="button">取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="xl-entry__top" style={{ marginBottom: 0 }}>
                      <div className="xl-entry__text" style={{ flex: 1 }}>{t.text}</div>
                      <div className="xl-entry__actions">
                        {colIdx > 0 && (
                          <button className="xl-entry__iconbtn" onClick={() => move(t, -1)} type="button" title="移回上一栏">
                            <ChevronLeft size={12} />
                          </button>
                        )}
                        {colIdx < COLUMNS.length - 1 && (
                          <button className="xl-entry__iconbtn" onClick={() => move(t, 1)} type="button" title="移到下一栏">
                            <ChevronRight size={12} />
                          </button>
                        )}
                        <button className="xl-entry__iconbtn" onClick={() => startEdit(t)} type="button" title="编辑"><Pencil size={12} /></button>
                        <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => remove(t.id)} type="button" title="删除"><XIcon size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {colTasks.length === 0 && <div className="xl-entry__empty">暂无任务</div>}
            </div>
          );
        })}
      </div>

      {!showAdd && <button className="xl-fab" onClick={() => setShowAdd(true)} type="button"><Plus size={22} /></button>}
    </div>
  );
}
