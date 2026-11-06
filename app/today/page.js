"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, MoonStar, Plus, Settings } from "lucide-react";
import { TopBar, CheckBox } from "@/components/ui";
import CreateSheet from "@/components/CreateSheet";
import { ItemRow, useLife } from "@/components/parts";
import { useCollection } from "@/lib/useCollection";
import { calendarItems, weekdayName } from "@/lib/items";
import { toKey } from "@/lib/date";

export default function TodayPage() {
  const { events, todos, projects, toggleTodo } = useLife();
  const { data: dumps } = useCollection("dumps");
  const [sheet, setSheet] = useState(null);

  const now = new Date();
  const today = toKey(now);
  const waiting = dumps.filter((d) => d.status === "new").length;

  const items = calendarItems(events, todos, projects, today, today);
  const allDay = items.filter((i) => !i.startTime && i.kind === "event");
  const timed = items.filter((i) => i.startTime);

  // Today's to-dos without a time, plus anything overdue.
  const color = Object.fromEntries(projects.map((p) => [p.id, p.color]));
  const loose = todos.filter((t) => !t.done && !t.startTime && ((t.doDate && t.doDate <= today) || (t.dueDate && t.dueDate <= today)));
  const doneToday = todos.filter((t) => t.done && t.doDate === today && !t.startTime);

  const open = (item) => setSheet({ kind: item.kind, item: item.raw, date: item.date });

  return (
    <>
      <TopBar title="今天" sub={`${now.getMonth() + 1}月${now.getDate()}日 ${weekdayName(now)}`}>
        <Link href="/settings" className="icon-btn" aria-label="设置"><Settings size={22} /></Link>
      </TopBar>

      {waiting > 0 && (
        <Link href="/dump?review=1" className="card card--tint dump-card">
          <MoonStar size={22} />
          <div className="grow">
            <div style={{ fontWeight: 500 }}>倒出箱里有 {waiting} 条还没整理</div>
            <div className="muted" style={{ fontSize: 13 }}>每晚 22:30 提醒你睡前整理</div>
          </div>
          <ChevronRight size={20} />
        </Link>
      )}

      {allDay.length > 0 && (
        <div className="allday">
          {allDay.map((i) => (
            <button key={i.id} type="button" className="allday__pill" style={{ background: i.color }} onClick={() => open(i)}>{i.title}</button>
          ))}
        </div>
      )}

      <div className="section-title">日程</div>
      {timed.length === 0 ? <div className="empty">今天没有安排的时间块</div> : (
        <div className="list">
          {timed.map((i) => <ItemRow key={i.id} item={i} onOpen={open} onToggle={toggleTodo} />)}
        </div>
      )}

      <div className="section-title">待办</div>
      {loose.length === 0 && doneToday.length === 0 ? <div className="empty">今天的待办都清空了 ✓</div> : (
        <div className="list">
          {loose.map((t) => {
            const overdue = (t.dueDate && t.dueDate < today) || (t.doDate && t.doDate < today);
            return (
              <div key={t.id} className="task-row" onClick={() => setSheet({ kind: "task", item: t })}>
                <CheckBox checked={false} color={color[t.projectId]} onChange={(v) => toggleTodo(t, v)} />
                <div className="grow">
                  <div className="ellipsis">{t.text}</div>
                  <div className="item-row__meta">
                    <span className="dot" style={{ background: color[t.projectId], width: 8, height: 8, marginRight: 6 }} />
                    {projects.find((p) => p.id === t.projectId)?.name}
                    {overdue && <span style={{ color: "var(--red)" }}> · 已逾期</span>}
                    {!overdue && t.dueDate === today && <span style={{ color: "var(--red)" }}> · 今天截止</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {doneToday.map((t) => (
            <div key={t.id} className="task-row task-row--done">
              <CheckBox checked color={color[t.projectId]} onChange={(v) => toggleTodo(t, v)} />
              <div className="grow ellipsis">{t.text}</div>
            </div>
          ))}
        </div>
      )}

      <button className="fab" type="button" onClick={() => setSheet({ kind: "event", date: today })} aria-label="新建"><Plus size={26} /></button>
      {sheet && <CreateSheet key={JSON.stringify(sheet.item?.id || sheet.date)} initial={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
