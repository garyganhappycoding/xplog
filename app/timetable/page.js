"use client";
import { useMemo, useState } from "react";
import { useCollection } from "@/lib/useCollection";
import Calendar from "@/components/Calendar";
import EventModal from "@/components/EventModal";
import { toKey, fromKey, monthGrid, weekDays, occurrenceDates, startOfDay } from "@/lib/date";

const pad2 = (n) => String(n).padStart(2, "0");

export default function TimetablePage() {
  const { data: projects } = useCollection("projects");
  const { data: todos, update: updateTodo } = useCollection("todos");
  const { data: events, add: addEvent, update: updateEvent, remove: removeEvent } = useCollection("events");

  const [view, setView] = useState("month");
  // Keep this normalized to local midnight - `new Date()` carries the current wall-clock
  // time, which otherwise makes "today" fail >= / <= range checks against midnight-based
  // occurrence dates (recurring events could vanish from the day view for today).
  const [date, _setDate] = useState(() => startOfDay(new Date()));
  const setDate = (d) => _setDate(startOfDay(d));
  const [modalInitial, setModalInitial] = useState(null); // null = closed
  const [modalOpen, setModalOpen] = useState(false);

  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  // The window of dates actually visible for the current view - recurring events only
  // need to be expanded into occurrences within this window, not for all time.
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (view === "month") { const g = monthGrid(date); return [g[0], g[41]]; }
    if (view === "week") { const w = weekDays(date); return [w[0], w[6]]; }
    return [date, date];
  }, [view, date]);

  // Merge todos (plan/due dates, no time-of-day) and events (may have a time, may repeat)
  // into one normalized list the Calendar component can bucket by date.
  const items = useMemo(() => {
    const out = [];
    for (const t of todos) {
      if (t.done && !t.doDate && !t.dueDate) continue;
      const color = projectById[t.projectId]?.color || "var(--muted)";
      if (t.doDate) {
        out.push({ id: `todo-do-${t.id}`, kind: "todo", date: t.doDate, title: t.text, color, allDay: true, done: t.done, raw: t });
      }
      if (t.dueDate && t.dueDate !== t.doDate) {
        out.push({ id: `todo-due-${t.id}`, kind: "todo", date: t.dueDate, title: `截止:${t.text}`, color, allDay: true, done: t.done, raw: t });
      }
    }
    for (const e of events) {
      const start = fromKey(e.date);
      const until = e.repeatUntil ? fromKey(e.repeatUntil) : null;
      const occurrences = occurrenceDates(start, e.repeat, until, rangeStart, rangeEnd);
      for (const occ of occurrences) {
        out.push({
          id: `${e.id}::${toKey(occ)}`, kind: "event", date: toKey(occ), title: e.title, color: e.color || "var(--gold)",
          allDay: !e.startTime, startTime: e.startTime, endTime: e.endTime, repeat: e.repeat, raw: e,
        });
      }
    }
    return out;
  }, [todos, events, projectById, rangeStart, rangeEnd]);

  const openAdd = (dateKey, hour) => {
    setModalInitial({
      date: dateKey,
      ...(hour != null ? { startTime: `${pad2(hour)}:00`, endTime: `${pad2((hour + 1) % 24)}:00` } : {}),
    });
    setModalOpen(true);
  };
  const openEdit = (event) => { setModalInitial(event); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setModalInitial(null); };

  const saveEvent = async (data) => {
    if (modalInitial?.id) await updateEvent(modalInitial.id, data);
    else await addEvent({ ...data, createdAt: Date.now() });
    closeModal();
  };
  const deleteEvent = async (id) => { await removeEvent(id); closeModal(); };

  return (
    <>
      <div className="xl-header"><div className="xl-title">日程</div></div>
      <div className="xl-subtitle" style={{ marginBottom: 14 }}>
        待办页的计划/截止日期会自动出现在这里,你也可以直接安排具体时间的事件。
      </div>

      <Calendar
        view={view}
        date={date}
        items={items}
        onView={setView}
        onDate={setDate}
        onToggleTodo={updateTodo}
        onEditEvent={openEdit}
        onAddEvent={openAdd}
      />

      {modalOpen && (
        <EventModal
          initial={modalInitial}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={closeModal}
        />
      )}
    </>
  );
}
