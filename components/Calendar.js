"use client";
import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Check, Plus, Repeat } from "lucide-react";
import {
  toKey, isSameDay, addDays, addMonths, addWeeks, monthGrid, weekDays,
  minutesOf, WEEKDAY_CN, monthLabel, dayLabel, weekRangeLabel,
} from "@/lib/date";

const HOUR_H = 48; // px per hour row
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VIEWS = [["month", "月"], ["week", "周"], ["day", "日"]];

// `items` is a flat list of normalized calendar entries built by the page:
//   { id, kind: "todo"|"event", date: "YYYY-MM-DD", title, color, allDay, startTime, endTime, done?, raw }
export default function Calendar({ view, date, items, onView, onDate, onToggleTodo, onEditEvent, onAddEvent }) {
  const byDate = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date).push(it);
    }
    return m;
  }, [items]);

  const today = new Date();
  const nav = (dir) => {
    if (view === "month") onDate(addMonths(date, dir));
    else if (view === "week") onDate(addWeeks(date, dir));
    else onDate(addDays(date, dir));
  };

  const label = view === "month" ? monthLabel(date) : view === "week" ? weekRangeLabel(date) : dayLabel(date);

  const openDay = (d) => { onDate(d); onView("day"); };

  return (
    <div>
      <div className="xl-cal-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="xl-entry__iconbtn" onClick={() => nav(-1)} type="button"><ChevronLeft size={14} /></button>
          <button className="xl-pill xl-pill--sm" onClick={() => onDate(new Date())} type="button">今天</button>
          <button className="xl-entry__iconbtn" onClick={() => nav(1)} type="button"><ChevronRight size={14} /></button>
          <span className="xl-title" style={{ fontSize: 15, marginLeft: 6 }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {VIEWS.map(([v, cn]) => (
            <button key={v} className={`xl-pill xl-pill--sm ${view === v ? "xl-pill--active" : ""}`} onClick={() => onView(v)} type="button">{cn}</button>
          ))}
          <button className="xl-pill xl-pill--sm xl-pill--dashed" onClick={() => onAddEvent(toKey(date))} type="button">
            <Plus size={11} /> 事件
          </button>
        </div>
      </div>

      {view === "month" && (
        <MonthGrid date={date} today={today} byDate={byDate} onOpenDay={openDay} onEditEvent={onEditEvent} />
      )}
      {view === "week" && (
        <TimeGrid
          days={weekDays(date)} today={today} byDate={byDate}
          onOpenDay={openDay} onToggleTodo={onToggleTodo} onEditEvent={onEditEvent} onAddEvent={onAddEvent}
        />
      )}
      {view === "day" && (
        <TimeGrid
          days={[date]} today={today} byDate={byDate}
          onOpenDay={openDay} onToggleTodo={onToggleTodo} onEditEvent={onEditEvent} onAddEvent={onAddEvent}
          expanded
        />
      )}
    </div>
  );
}

function MonthGrid({ date, today, byDate, onOpenDay, onEditEvent }) {
  const cells = monthGrid(date);
  return (
    <div className="xl-cal-month">
      <div className="xl-cal-month__dow">
        {WEEKDAY_CN.map((w) => <div key={w} className="xl-cal-month__dowcell">{w}</div>)}
      </div>
      <div className="xl-cal-month__grid">
        {cells.map((d) => {
          const key = toKey(d);
          const list = (byDate.get(key) || []).slice().sort((a, b) => (minutesOf(a.startTime) ?? -1) - (minutesOf(b.startTime) ?? -1));
          const shown = list.slice(0, 3);
          const inMonth = d.getMonth() === date.getMonth();
          return (
            <div
              key={key}
              className={`xl-cal-month__cell ${inMonth ? "" : "xl-cal-month__cell--dim"} ${isSameDay(d, today) ? "xl-cal-month__cell--today" : ""}`}
              onClick={() => onOpenDay(d)}
            >
              <div className="xl-cal-month__daynum">{d.getDate()}</div>
              {shown.map((it) => (
                <div
                  key={it.id}
                  className={`xl-cal-chip ${it.done ? "xl-cal-chip--done" : ""}`}
                  style={{ "--chip-color": it.color }}
                  onClick={(e) => { e.stopPropagation(); if (it.kind === "event") onEditEvent(it.raw); else onOpenDay(d); }}
                  title={it.title}
                >
                  {it.repeat && it.repeat !== "none" && <Repeat size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}
                  {it.title}
                </div>
              ))}
              {list.length > shown.length && <div className="xl-cal-more">+{list.length - shown.length} 更多</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Powers both week (N columns) and day (1 column) views: an all-day strip plus a scrollable hour grid.
function TimeGrid({ days, today, byDate, onOpenDay, onToggleTodo, onEditEvent, onAddEvent, expanded }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H;
  }, []);

  const columns = days.map((d) => {
    const key = toKey(d);
    const list = byDate.get(key) || [];
    return {
      date: d,
      key,
      allDay: list.filter((it) => it.allDay),
      timed: list.filter((it) => !it.allDay).sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime)),
    };
  });

  return (
    <div className="xl-cal-timegrid">
      <div className="xl-cal-week__header" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {columns.map((c) => (
          <div
            key={c.key}
            className={`xl-cal-week__day ${isSameDay(c.date, today) ? "xl-cal-week__day--today" : ""}`}
            onClick={() => onOpenDay(c.date)}
          >
            <span className="xl-mono" style={{ fontSize: 10 }}>{WEEKDAY_CN[(c.date.getDay() + 6) % 7]}</span>
            <span style={{ fontWeight: 700 }}>{c.date.getDate()}</span>
          </div>
        ))}
      </div>

      <div className="xl-cal-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div className="xl-cal-gutter__label">待办</div>
        {columns.map((c) => (
          <div key={c.key} className="xl-cal-allday__col">
            {c.allDay.map((it) => (
              <div key={it.id} className="xl-cal-chip xl-cal-chip--block" style={{ "--chip-color": it.color }}>
                {it.kind === "todo" ? (
                  <button
                    className={`xl-todo-check ${it.done ? "xl-todo-check--done" : ""}`}
                    style={{ width: 13, height: 13, flexShrink: 0 }}
                    onClick={() => onToggleTodo(it.raw.id, { done: !it.done })}
                    type="button"
                  >
                    {it.done && <Check size={9} />}
                  </button>
                ) : (
                  <span className="xl-project-dot" style={{ background: it.color, flexShrink: 0 }} />
                )}
                <span
                  style={{ textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.5 : 1, cursor: it.kind === "event" ? "pointer" : "default", overflowWrap: "anywhere" }}
                  onClick={() => it.kind === "event" && onEditEvent(it.raw)}
                >
                  {it.repeat && it.repeat !== "none" && <Repeat size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}
                  {it.title}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="xl-cal-grid" ref={scrollRef} style={{ maxHeight: expanded ? 560 : 420 }}>
        <div className="xl-cal-grid__inner" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: 24 * HOUR_H }}>
          <div className="xl-cal-gutter">
            {HOURS.map((h) => <div key={h} className="xl-cal-gutter__h" style={{ top: h * HOUR_H }}>{String(h).padStart(2, "0")}:00</div>)}
          </div>
          {columns.map((c) => (
            <div key={c.key} className="xl-cal-daycol">
              {HOURS.map((h) => (
                <div key={h} className="xl-cal-hourline" style={{ top: h * HOUR_H }} onClick={() => onAddEvent(c.key, h)} />
              ))}
              {c.timed.map((it) => {
                const start = minutesOf(it.startTime) ?? 0;
                const end = it.endTime ? minutesOf(it.endTime) : start + 60;
                const top = (start / 60) * HOUR_H;
                const height = Math.max(((Math.max(end, start + 15) - start) / 60) * HOUR_H, 20);
                return (
                  <div
                    key={it.id}
                    className="xl-cal-event"
                    style={{ top, height, "--chip-color": it.color }}
                    onClick={(e) => { e.stopPropagation(); onEditEvent(it.raw); }}
                    title={it.title}
                  >
                    <div className="xl-cal-event__title">
                      {it.repeat && it.repeat !== "none" && <Repeat size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}
                      {it.title}
                    </div>
                    <div className="xl-cal-event__time">{it.startTime}{it.endTime ? `–${it.endTime}` : ""}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
