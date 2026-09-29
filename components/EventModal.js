"use client";
import { useState } from "react";
import { X as XIcon, Trash2 } from "lucide-react";
import { toKey } from "@/lib/date";

const COLOR_PRESETS = ["#C9A24B", "#5C8A72", "#A23B3B", "#7A8AC9", "#92897A", "#B07AA1", "#D08C5A"];
const REPEAT_OPTIONS = [["none", "不重复"], ["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"]];

// Add/edit panel for a scheduled event. `initial` carries a prefilled date/time for quick-add,
// or the full event doc (with `id`) when editing.
export default function EventModal({ initial, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || toKey(new Date()));
  const [allDay, setAllDay] = useState(initial ? !initial.startTime : false);
  const [startTime, setStartTime] = useState(initial?.startTime || "09:00");
  const [endTime, setEndTime] = useState(initial?.endTime || "10:00");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [color, setColor] = useState(initial?.color || COLOR_PRESETS[0]);
  const [repeat, setRepeat] = useState(initial?.repeat || "none");
  const [repeatUntil, setRepeatUntil] = useState(initial?.repeatUntil || "");

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      date,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      notes: notes.trim(),
      color,
      repeat,
      repeatUntil: repeat === "none" ? null : (repeatUntil || null),
    });
  };

  return (
    <div className="xl-modal-overlay" onClick={onClose}>
      <div className="xl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="xl-title" style={{ fontSize: 16 }}>{initial?.id ? "编辑事件" : "添加事件"}</div>
          <button className="xl-entry__iconbtn" onClick={onClose} type="button"><XIcon size={14} /></button>
        </div>

        <div className="xl-field">
          <label className="xl-label">事件名称</label>
          <input className="xl-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如:和朋友吃饭" autoFocus />
        </div>

        <div className="xl-field">
          <label className="xl-label">日期</label>
          <input className="xl-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)", marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          全天事件(不设置具体时间)
        </label>

        {!allDay && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div className="xl-field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="xl-label">开始时间</label>
              <input className="xl-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="xl-field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="xl-label">结束时间</label>
              <input className="xl-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div className="xl-field">
          <label className="xl-label">重复</label>
          <div className="xl-pillrow">
            {REPEAT_OPTIONS.map(([v, cn]) => (
              <button
                key={v}
                type="button"
                className={`xl-pill xl-pill--sm ${repeat === v ? "xl-pill--active" : ""}`}
                onClick={() => setRepeat(v)}
              >
                {cn}
              </button>
            ))}
          </div>
          {repeat !== "none" && (
            <div style={{ marginTop: 10 }}>
              <label className="xl-label">结束重复(可选,留空则一直重复)</label>
              <input className="xl-input" type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} />
            </div>
          )}
        </div>

        <div className="xl-field">
          <label className="xl-label">备注(可选)</label>
          <input className="xl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="地点、提醒事项等" />
        </div>

        <div className="xl-field">
          <label className="xl-label">颜色</label>
          <div className="xl-pillrow">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className="xl-color-swatch"
                style={{ background: c, outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="xl-btn" onClick={save} type="button">保存</button>
          <button className="xl-btn--ghost" onClick={onClose} type="button">取消</button>
          {initial?.id && (
            <button className="xl-btn--ghost xl-btn--danger" style={{ marginLeft: "auto" }} onClick={() => onDelete(initial.id)} type="button">
              <Trash2 size={12} style={{ marginRight: 6, verticalAlign: -2 }} />删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
