"use client";
import { useState } from "react";
import { AlignLeft, Bell, Clock, MapPin, Repeat, Trash2 } from "lucide-react";
import { Sheet, ConfirmDialog } from "@/components/ui";
import { useCollection } from "@/lib/useCollection";
import { COLORS } from "@/lib/demo";
import { plusHour, stamp, todayKey } from "@/lib/items";

const PALETTE = [COLORS.tomato, COLORS.tangerine, COLORS.banana, COLORS.sage, COLORS.basil, COLORS.peacock, COLORS.blueberry, COLORS.grape, COLORS.graphite];
const REMINDS = [[0, "不提前提醒"], [1, "前一天提醒(Telegram)"], [2, "前两天提醒"], [7, "前一周提醒"]];
const REPEATS = [["none", "不重复"], ["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"], ["yearly", "每年"]];

const nextHour = () => `${String((new Date().getHours() + 1) % 24).padStart(2, "0")}:00`;

// One sheet for creating AND editing: a calendar event, or a to-do (which becomes a time block on the
// calendar when it has a time). Mount it with a fresh `key` each time it is opened.
//   initial: { kind: "event"|"task", date?, startTime?, endTime?, item? }   item = existing event/todo doc
export default function CreateSheet({ initial = {}, onClose, onSaved }) {
  const { add: addEvent, update: updateEvent, remove: removeEvent } = useCollection("events");
  const { add: addTodo, update: updateTodo, remove: removeTodo } = useCollection("todos");
  const { data: projects } = useCollection("projects");
  const { data: sections } = useCollection("sections");

  const editing = initial.item || null;
  const [kind, setKind] = useState(initial.kind || "event");
  const [title, setTitle] = useState(editing ? editing.title || editing.text || "" : initial.title || "");
  // A new to-do starts unscheduled (no date); a new event starts today.
  const [date, setDate] = useState(initial.date || editing?.date || editing?.doDate || (initial.kind === "task" ? "" : todayKey()));
  // New events start with a time (the next full hour) unless a slot was tapped; new to-dos start without one.
  const defaultStart = initial.startTime || (initial.kind === "task" ? "" : nextHour());
  const [allDay, setAllDay] = useState(editing ? !editing.startTime && !initial.startTime : !defaultStart);
  const [start, setStart] = useState(editing?.startTime || defaultStart);
  const [end, setEnd] = useState(editing?.endTime || initial.endTime || (defaultStart ? plusHour(defaultStart) : ""));
  const [color, setColor] = useState(editing?.color || COLORS.blueberry);
  const [location, setLocation] = useState(editing?.location || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [repeat, setRepeat] = useState(editing?.repeat || "none");
  const [repeatUntil, setRepeatUntil] = useState(editing?.repeatUntil || "");
  const [remind, setRemind] = useState(Number(editing?.remindBeforeDays) || 0);
  const [projectId, setProjectId] = useState(editing?.projectId || initial.projectId || "");
  const [sectionId, setSectionId] = useState(editing?.sectionId || initial.sectionId || "");
  const [dueDate, setDueDate] = useState(editing?.dueDate || "");
  const [askDelete, setAskDelete] = useState(false);

  const board = projectId || projects[0]?.id || "";
  const boardSections = sections.filter((s) => s.projectId === board);
  const isEvent = kind === "event";

  // A to-do defaults to "no time"; an event defaults to a one-hour slot.
  const pickKind = (k) => {
    setKind(k);
    if (k === "event" && !date) setDate(todayKey());
    if (k === "task" && !initial.startTime) setAllDay(true);
    if (k === "event" && allDay && !initial.startTime) {
      setAllDay(false);
      const s = start || nextHour();
      setStart(s);
      if (!end) setEnd(plusHour(s));
    }
  };

  const setStartTime = (v) => {
    setStart(v);
    if (v && !end) setEnd(plusHour(v));
  };

  const save = async () => {
    const name = title.trim();
    if (!name) return;
    const timed = !allDay && start;
    if (isEvent) {
      const doc = {
        title: name, date: date || todayKey(), startTime: timed ? start : null, endTime: timed ? end || plusHour(start) : null,
        color, location: location.trim(), notes: notes.trim(), repeat, repeatUntil: repeat !== "none" && repeatUntil ? repeatUntil : null, remindBeforeDays: remind,
      };
      if (editing) await updateEvent(editing.id, doc);
      else await addEvent({ ...doc, createdAt: stamp() });
    } else {
      const doc = {
        text: name, projectId: board, sectionId: boardSections.some((s) => s.id === sectionId) ? sectionId : null,
        doDate: date || (timed ? todayKey() : null), dueDate: dueDate || null, startTime: timed ? start : null, endTime: timed ? end || plusHour(start) : null,
      };
      if (editing) await updateTodo(editing.id, doc);
      else await addTodo({ ...doc, done: false, createdAt: stamp(), order: stamp() });
    }
    onSaved?.();
    onClose();
  };

  const del = async () => {
    if (isEvent) await removeEvent(editing.id);
    else await removeTodo(editing.id);
    onClose();
  };

  return (
    <Sheet open onClose={onClose}>
      <input className="input input--ghost" placeholder={isEvent ? "添加标题" : "添加待办"} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!editing} style={{ marginBottom: 12 }} />

      {!editing && (
        <div className="seg" style={{ marginBottom: 16 }}>
          {[["event", "日程"], ["task", "待办"]].map(([k, cn]) => (
            <button key={k} type="button" className={`seg__item ${kind === k ? "seg__item--on" : ""}`} onClick={() => pickKind(k)}>{cn}</button>
          ))}
        </div>
      )}

      <div className="form-row">
        <Clock size={20} className="form-row__icon" />
        <div className="grow">
          <input className="input input--plain" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {!allDay && (
            <div className="row" style={{ marginTop: 6 }}>
              <input className="input input--plain" type="time" value={start} onChange={(e) => setStartTime(e.target.value)} />
              <span className="muted">–</span>
              <input className="input input--plain" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          )}
        </div>
        <label className="switch-label">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {isEvent ? "全天" : "不设时间"}
        </label>
      </div>
      {!isEvent && !allDay && !start && <div className="hint">给待办设一个时间,它就会变成日历里的时间块(同步到 Google 日历)。</div>}

      {isEvent ? (
        <>
          <div className="form-row">
            <Repeat size={20} className="form-row__icon" />
            <select className="select input--plain" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {REPEATS.map(([v, cn]) => <option key={v} value={v}>{cn}</option>)}
            </select>
          </div>
          {repeat !== "none" && (
            <div className="form-row">
              <span className="form-row__icon muted" style={{ fontSize: 12 }}>直到</span>
              <input className="input input--plain" type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
            </div>
          )}
          <div className="form-row">
            <Bell size={20} className="form-row__icon" />
            <select className="select input--plain" value={remind} onChange={(e) => setRemind(Number(e.target.value))}>
              {REMINDS.map(([v, cn]) => <option key={v} value={v}>{cn}</option>)}
            </select>
          </div>
          <div className="form-row">
            <MapPin size={20} className="form-row__icon" />
            <input className="input input--plain" placeholder="添加地点" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="form-row">
            <AlignLeft size={20} className="form-row__icon" />
            <input className="input input--plain" placeholder="添加备注" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="colors">
            {PALETTE.map((c) => (
              <button key={c} type="button" className={`colors__dot ${color === c ? "colors__dot--on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label="颜色" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="form-row">
            <span className="form-row__icon dot" style={{ background: projects.find((p) => p.id === board)?.color || COLORS.graphite, width: 14, height: 14 }} />
            <div className="row grow">
              <select className="select input--plain" value={board} onChange={(e) => { setProjectId(e.target.value); setSectionId(""); }}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="select input--plain" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">未分区</option>
                {boardSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <span className="form-row__icon muted" style={{ fontSize: 12 }}>截止</span>
            <input className="input input--plain" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </>
      )}

      <div className="sheet__actions" style={{ justifyContent: editing ? "space-between" : "flex-end" }}>
        {editing && <button className="btn btn--text" style={{ color: "var(--red)" }} onClick={() => setAskDelete(true)} type="button"><Trash2 size={16} /> 删除</button>}
        <div className="row">
          <button className="btn btn--text" onClick={onClose} type="button">取消</button>
          <button className="btn" onClick={save} disabled={!title.trim()} type="button">保存</button>
        </div>
      </div>

      <ConfirmDialog open={askDelete} title="删除?" message={`「${title}」会被删除。`} onConfirm={del} onCancel={() => setAskDelete(false)} />
    </Sheet>
  );
}
