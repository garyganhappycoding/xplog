"use client";
import { MapPin } from "lucide-react";
import { CheckBox } from "@/components/ui";
import { useCollection } from "@/lib/useCollection";

// Shared data hook: everything the calendar-ish screens need.
export function useLife() {
  const events = useCollection("events");
  const todos = useCollection("todos");
  const projects = useCollection("projects");
  return {
    events: events.data,
    todos: todos.data,
    projects: projects.data,
    loading: events.loading || todos.loading || projects.loading,
    toggleTodo: (t, done) => todos.update(t.id, { done, doneAt: done ? Date.now() : null }),
  };
}

// One calendar item (event or time-blocked task) as a list row.
export function ItemRow({ item, onOpen, onToggle, showDate }) {
  const time = item.startTime ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}` : "全天";
  return (
    <div className={`item-row ${item.done ? "item-row--done" : ""}`} onClick={() => onOpen(item)} role="button" tabIndex={0}>
      <div className="item-row__time">{time}</div>
      <span className="item-row__bar" style={{ background: item.color }} />
      <div className="grow">
        <div className="item-row__title ellipsis">{item.title}</div>
        <div className="item-row__meta ellipsis">
          {item.kind === "task" ? "待办" : "日程"}
          {showDate ? ` · ${item.date.slice(5).replace("-", "月")}日` : ""}
          {item.location ? <> · <MapPin size={11} style={{ verticalAlign: "-1px" }} /> {item.location}</> : null}
        </div>
      </div>
      {item.kind === "task" && <CheckBox checked={!!item.done} color={item.color} onChange={(v) => onToggle(item.raw, v)} />}
    </div>
  );
}
