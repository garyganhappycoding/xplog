"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Pill } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/xp";
import TagInput from "@/components/TagInput";

export default function NoteEditor({ note, allTags, onSave, onCancel }) {
  const [title, setTitle] = useState(note ? note.title : "");
  const [category, setCategory] = useState(note ? note.category : "input");
  const [tags, setTags] = useState(note ? [...(note.tags || [])] : []);
  const [text, setText] = useState(note ? note.text : "");

  return (
    <div>
      <button className="xl-back" onClick={onCancel} type="button"><ArrowLeft size={14} /> 关闭笔记</button>

      <input className="xl-input--plain xl-note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题" autoFocus />
      <div className="xl-divider" />

      <div className="xl-pillrow" style={{ marginBottom: 18 }}>
        {["input", "permanent", "output"].map((c) => (
          <Pill key={c} active={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABEL[c]}</Pill>
        ))}
      </div>
      <div className="xl-divider" />

      <TagInput tags={tags} setTags={setTags} allTags={allTags} />
      <div className="xl-divider" />

      <textarea className="xl-input--plain" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="开始写下你的想法..." />

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button className="xl-btn" type="button" onClick={() => {
          if (title.trim() || text.trim()) onSave(note ? note.id : null, title.trim() || "(无标题)", category, tags, text.trim());
        }}>
          {note ? "更新笔记" : "保存笔记"}
        </button>
        <button className="xl-btn--ghost" onClick={onCancel} type="button">取消</button>
      </div>
    </div>
  );
}
