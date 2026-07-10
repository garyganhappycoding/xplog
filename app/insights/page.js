"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { CATEGORY_LABEL, CATEGORY_CN } from "@/lib/xp";
import NoteEditor from "@/components/NoteEditor";

const COLUMNS = ["input", "permanent", "output"];

export default function InsightsPage() {
  const { data: notes, add, update } = useCollection("notes");
  const [editingNote, setEditingNote] = useState(undefined); // undefined = closed, null = new, object = editing

  const allTags = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  const handleSave = async (id, title, category, tags, text) => {
    if (id) {
      await update(id, { title, category, tags, text });
    } else {
      await add({ title, category, tags, text, createdAt: Date.now() });
    }
    setEditingNote(undefined);
  };

  const handleMove = (id, category) => update(id, { category });

  if (editingNote !== undefined) {
    return (
      <NoteEditor
        note={editingNote}
        allTags={allTags}
        onCancel={() => setEditingNote(undefined)}
        onSave={handleSave}
      />
    );
  }

  return (
    <div style={{ position: "relative", minHeight: 440 }}>
      <div className="xl-header">
        <div>
          <div className="xl-title">Daily Insights</div>
          <div className="xl-subtitle">Input → Permanent Notes → Output · 打开导航栏「关系图」查看笔记关系</div>
        </div>
      </div>

      <div className="xl-kanban">
        {COLUMNS.map((col) => (
          <div key={col}>
            <div className="xl-kanban__head">{CATEGORY_CN[col]}</div>
            <div className="xl-kanban__sub">{CATEGORY_LABEL[col].toUpperCase()} · {notes.filter((n) => n.category === col).length}</div>
            {notes.filter((n) => n.category === col).map((n) => (
              <div className="xl-entry xl-entry--clickable" key={n.id} style={{ padding: "12px 14px" }} onClick={() => setEditingNote(n)}>
                <div className="xl-note-card-title">{n.title}</div>
                <div className="xl-entry__text" style={{ marginBottom: 8 }}>{n.text}</div>
                <div>{(n.tags || []).map((t) => <span className="xl-tagpill" key={t}>#{t}</span>)}</div>
                <div className="xl-note-cat-row" onClick={(e) => e.stopPropagation()}>
                  {COLUMNS.map((c) => (
                    <button key={c} className={`xl-note-cat-btn ${n.category === c ? "xl-note-cat-btn--active" : ""}`} onClick={() => handleMove(n.id, c)} type="button">
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button className="xl-fab" onClick={() => setEditingNote(null)} type="button"><Plus size={22} /></button>
    </div>
  );
}
