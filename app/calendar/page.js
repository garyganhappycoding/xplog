"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Inbox, Plus } from "lucide-react";
import { TopBar, Sheet } from "@/components/ui";
import CreateSheet from "@/components/CreateSheet";
import { ItemRow, useLife } from "@/components/parts";
import { addDays, addMonths, fromKey, isSameDay, monthGrid, toKey, weekDays, WEEKDAY_CN } from "@/lib/date";
import { calendarItems, fromMin, groupByDate, toMin } from "@/lib/items";

const HOUR_H = 52;
const GUTTER = 44;
const VIEWS = [["day", "日", 1], ["three", "3 天", 3], ["week", "周", 7], ["month", "月", 0], ["agenda", "日程", 0]];

// Side-by-side layout for overlapping blocks within one day.
function layoutDay(items) {
  const evs = items
    .map((i) => {
      const s = toMin(i.startTime);
      const e = toMin(i.endTime);
      return { ...i, s, e: e && e > s ? Math.max(e, s + 30) : s + 60 };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = [];
    for (const ev of cluster) {
      let c = cols.findIndex((end) => end <= ev.s);
      if (c === -1) { c = cols.length; cols.push(ev.e); } else cols[c] = ev.e;
      ev.col = c;
    }
    for (const ev of cluster) { ev.cols = cols.length; out.push(ev); }
    cluster = [];
    clusterEnd = 0;
  };
  for (const ev of evs) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  flush();
  return out;
}

function TimeGrid({ days, byDate, onSlot, onOpen, onToggle }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_H - 8;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const today = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const allDayRow = days.map((d) => (byDate.get(toKey(d)) || []).filter((i) => !i.startTime));

  return (
    <>
      <div className="tg__head" style={{ paddingLeft: GUTTER }}>
        {days.map((d) => (
          <div key={+d} className={`tg__day ${isSameDay(d, today) ? "tg__day--today" : ""}`}>
            <span>{WEEKDAY_CN[(d.getDay() + 6) % 7]}</span>
            <b>{d.getDate()}</b>
          </div>
        ))}
      </div>
      {allDayRow.some((r) => r.length) && (
        <div className="tg__allday" style={{ paddingLeft: GUTTER }}>
          {allDayRow.map((r, ix) => (
            <div key={ix} className="tg__allday-col">
              {r.map((i) => (
                <button key={i.id} type="button" className="tg__pill" style={i.kind === "event" ? { background: i.color, color: "#fff" } : { background: `${i.color}29`, color: "#202124", borderLeft: `3px solid ${i.color}` }} onClick={() => onOpen(i)}>
                  {i.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg__scroll" ref={scroller}>
        <div className="tg__body" style={{ height: 24 * HOUR_H }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="tg__hour" style={{ top: h * HOUR_H, height: HOUR_H }}>
              <span className="tg__label" style={{ width: GUTTER }}>{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</span>
            </div>
          ))}
          <div className="tg__cols" style={{ left: GUTTER }}>
            {days.map((d) => {
              const key = toKey(d);
              const timed = layoutDay((byDate.get(key) || []).filter((i) => i.startTime));
              return (
                <div
                  key={key}
                  className="tg__col"
                  onClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const min = Math.min(23 * 60, Math.floor(((y / HOUR_H) * 60) / 30) * 30);
                    onSlot(key, fromMin(min));
                  }}
                >
                  {timed.map((i) => {
                    const task = i.kind === "task";
                    return (
                      <div
                        key={i.id}
                        className={`tg__block ${task ? "tg__block--task" : ""} ${i.done ? "tg__block--done" : ""}`}
                        style={{
                          top: (i.s / 60) * HOUR_H,
                          height: Math.max(22, ((i.e - i.s) / 60) * HOUR_H - 2),
                          left: `${(i.col / i.cols) * 100}%`,
                          width: `calc(${100 / i.cols}% - 2px)`,
                          ...(task ? { background: `${i.color}29`, borderLeft: `3px solid ${i.color}` } : { background: i.color }),
                        }}
                        onClick={(e) => { e.stopPropagation(); onOpen(i); }}
                      >
                        {task && (
                          <button type="button" className={`tg__check ${i.done ? "tg__check--on" : ""}`} style={{ borderColor: i.color, background: i.done ? i.color : "transparent" }} onClick={(e) => { e.stopPropagation(); onToggle(i.raw, !i.done); }} aria-label="完成">
                            {i.done && <Check size={10} strokeWidth={4} color="#fff" />}
                          </button>
                        )}
                        <span className="tg__title">{i.title}</span>
                        {i.e - i.s >= 50 && <span className="tg__time">{i.startTime}–{fromMin(i.e)}</span>}
                      </div>
                    );
                  })}
                  {isSameDay(d, today) && <div className="tg__now" style={{ top: (nowMin / 60) * HOUR_H }}><i /></div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function MonthView({ anchor, byDate, selected, onSelect }) {
  const cells = monthGrid(anchor);
  const today = new Date();
  return (
    <div className="mg">
      <div className="mg__head">{WEEKDAY_CN.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="mg__grid">
        {cells.map((d) => {
          const key = toKey(d);
          const items = byDate.get(key) || [];
          return (
            <button key={key} type="button" className={`mg__cell ${d.getMonth() !== anchor.getMonth() ? "mg__cell--out" : ""} ${key === selected ? "mg__cell--sel" : ""}`} onClick={() => onSelect(key)}>
              <span className={`mg__num ${isSameDay(d, today) ? "mg__num--today" : ""}`}>{d.getDate()}</span>
              {items.slice(0, 3).map((i) => (
                <span key={i.id} className="mg__chip" style={i.kind === "event" ? { background: i.color, color: "#fff" } : { background: `${i.color}29`, color: "#202124", boxShadow: `inset 2px 0 0 ${i.color}` }}>{i.title}</span>
              ))}
              {items.length > 3 && <span className="mg__more">+{items.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { events, todos, projects, toggleTodo } = useLife();
  const [view, setView] = useState("three");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toKey(new Date()));
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState(null);
  const touch = useRef(null);

  const span = VIEWS.find((v) => v[0] === view)[2];
  const days = useMemo(() => {
    if (view === "week") return weekDays(anchor);
    if (span) return Array.from({ length: span }, (_, i) => addDays(anchor, i));
    return [];
  }, [view, span, anchor]);

  const range = useMemo(() => {
    if (view === "month") { const g = monthGrid(anchor); return [toKey(g[0]), toKey(g[41])]; }
    if (view === "agenda") return [toKey(anchor), toKey(addDays(anchor, 30))];
    return [toKey(days[0]), toKey(days[days.length - 1])];
  }, [view, anchor, days]);

  const items = useMemo(() => calendarItems(events, todos, projects, range[0], range[1]), [events, todos, projects, range]);
  const byDate = useMemo(() => groupByDate(items), [items]);
  const unscheduled = todos.filter((t) => !t.done && !t.doDate && !t.startTime);

  const step = (dir) => {
    if (view === "month") setAnchor(addMonths(anchor, dir));
    else if (view === "agenda") setAnchor(addDays(anchor, dir * 14));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(addDays(anchor, dir * span));
  };
  const goToday = () => { setAnchor(new Date()); setSelected(toKey(new Date())); };

  const title = view === "month" || view === "week" || view === "agenda" ? `${anchor.getFullYear()}年${anchor.getMonth() + 1}月` : `${days[0].getFullYear()}年${days[0].getMonth() + 1}月`;
  const open = (item) => setSheet({ kind: item.kind, item: item.raw, date: item.date });
  const openNew = (date, startTime) => setSheet({ kind: "event", date, startTime });

  const onTouchStart = (e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current[0];
    const dy = e.changedTouches[0].clientY - touch.current[1];
    touch.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) step(dx < 0 ? 1 : -1);
  };

  const gridView = view !== "month" && view !== "agenda";
  const dayItems = byDate.get(selected) || [];
  const agendaDays = [...byDate.keys()].sort();

  return (
    <div className={gridView ? "cal cal--grid" : "cal"}>
      <TopBar title={
        <button type="button" className="view-btn" onClick={() => setMenu((m) => !m)}>{title}<ChevronDown size={18} /></button>
      }>
        <button type="button" className="btn btn--outline btn--sm" onClick={goToday}>今天</button>
        <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="上一个"><ChevronLeft size={22} /></button>
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="下一个"><ChevronRight size={22} /></button>
      </TopBar>

      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="menu">
            {VIEWS.map(([k, cn]) => (
              <button key={k} type="button" className={`menu__item ${view === k ? "menu__item--on" : ""}`} onClick={() => { setView(k); setMenu(false); }}>
                {cn}{view === k && <Check size={16} />}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="cal__sub">
        <button type="button" className="chip" onClick={() => setTray(true)}><Inbox size={14} /> 待安排 {unscheduled.length}</button>
        <span className="muted" style={{ fontSize: 12 }}>点空白处新建 · 左右滑动翻页</span>
      </div>

      <div className="cal__body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {gridView && <TimeGrid key={view} days={days} byDate={byDate} onSlot={openNew} onOpen={open} onToggle={toggleTodo} />}

        {view === "month" && (
          <>
            <MonthView anchor={anchor} byDate={byDate} selected={selected} onSelect={setSelected} />
            <div className="section-title">{fromKey(selected).getMonth() + 1}月{fromKey(selected).getDate()}日</div>
            {dayItems.length === 0 ? <div className="empty">这一天没有安排</div> : (
              <div className="list">{dayItems.map((i) => <ItemRow key={i.id} item={i} onOpen={open} onToggle={toggleTodo} />)}</div>
            )}
            <div style={{ padding: "0 16px" }}>
              <button type="button" className="btn btn--tonal btn--block" onClick={() => openNew(selected)}><Plus size={18} /> 在这一天添加</button>
            </div>
          </>
        )}

        {view === "agenda" && (
          agendaDays.length === 0 ? <div className="empty">接下来 30 天没有安排</div> : agendaDays.map((k) => {
            const d = fromKey(k);
            return (
              <div key={k}>
                <div className="section-title">{d.getMonth() + 1}月{d.getDate()}日 · 星期{WEEKDAY_CN[(d.getDay() + 6) % 7]}{k === toKey(new Date()) ? " · 今天" : ""}</div>
                <div className="list">{byDate.get(k).map((i) => <ItemRow key={i.id} item={i} onOpen={open} onToggle={toggleTodo} />)}</div>
              </div>
            );
          })
        )}
      </div>

      <button className="fab" type="button" onClick={() => openNew(toKey(gridView ? days[0] : view === "month" ? fromKey(selected) : new Date()))} aria-label="新建"><Plus size={26} /></button>

      <Sheet open={tray} onClose={() => setTray(false)} title={`待安排的待办 · ${unscheduled.length}`}>
        <p className="muted" style={{ marginTop: -6 }}>点一个待办,给它安排日期和时间,它就会变成日历里的时间块。</p>
        {unscheduled.length === 0 && <div className="empty">所有待办都安排好了</div>}
        {unscheduled.map((t) => (
          <button key={t.id} type="button" className="tray-row" onClick={() => { setTray(false); setSheet({ kind: "task", item: t, date: toKey(anchor), startTime: "09:00" }); }}>
            <span className="dot" style={{ background: projects.find((p) => p.id === t.projectId)?.color }} />
            <span className="grow ellipsis">{t.text}</span>
            <span className="muted" style={{ fontSize: 12 }}>{projects.find((p) => p.id === t.projectId)?.name}</span>
          </button>
        ))}
      </Sheet>

      {sheet && <CreateSheet key={`${sheet.item?.id || ""}${sheet.date}${sheet.startTime || ""}`} initial={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
