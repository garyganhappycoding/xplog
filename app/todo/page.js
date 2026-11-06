"use client";
import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronRight, FolderPlus, Plus } from "lucide-react";
import { TopBar, Chip, CheckBox, Sheet } from "@/components/ui";
import CreateSheet from "@/components/CreateSheet";
import { useCollection } from "@/lib/useCollection";
import { COLORS } from "@/lib/demo";
import { addDays, fromKey, toKey } from "@/lib/date";

const BOARD_COLORS = [COLORS.blueberry, COLORS.sage, COLORS.tangerine, COLORS.tomato, COLORS.grape, COLORS.peacock, COLORS.banana, COLORS.graphite];
const asc = (a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);

function relDate(key, today) {
  if (key === today) return "今天";
  if (key === toKey(addDays(fromKey(today), 1))) return "明天";
  if (key === toKey(addDays(fromKey(today), -1))) return "昨天";
  const d = fromKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function TaskRow({ t, color, today, onToggle, onOpen }) {
  const overdue = !t.done && t.dueDate && t.dueDate < today;
  return (
    <div className={`task-row ${t.done ? "task-row--done" : ""}`} onClick={() => onOpen(t)}>
      <CheckBox checked={!!t.done} color={color} onChange={(v) => onToggle(t, v)} />
      <div className="grow">
        <div className="task-row__text">{t.text}</div>
        {(t.dueDate || t.doDate || t.startTime) && (
          <div className="task-row__chips">
            {t.startTime && <span className="tag tag--blue"><CalendarClock size={12} /> {relDate(t.doDate || today, today)} {t.startTime}</span>}
            {!t.startTime && t.doDate && <span className="tag">计划 {relDate(t.doDate, today)}</span>}
            {t.dueDate && <span className={`tag ${overdue ? "tag--red" : ""}`}>截止 {relDate(t.dueDate, today)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAdd({ placeholder, onAdd, label }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if (v) await onAdd(v);
    setText("");
  };
  if (!open) return <button type="button" className="add-link" onClick={() => setOpen(true)}><Plus size={18} /> {label}</button>;
  return (
    <form className="quick" onSubmit={submit}>
      <input className="input" autoFocus placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text.trim() && setOpen(false)} />
      <button className="btn" type="submit" disabled={!text.trim()}>添加</button>
    </form>
  );
}

export default function TodoPage() {
  const { data: projects, add: addProject } = useCollection("projects");
  const { data: sections, add: addSection } = useCollection("sections");
  const { data: todos, add: addTodo, update: updateTodo } = useCollection("todos");
  const [board, setBoard] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [showDone, setShowDone] = useState({});
  const [sheet, setSheet] = useState(null);
  const [newBoard, setNewBoard] = useState(false);
  const [boardName, setBoardName] = useState("");

  const today = toKey(new Date());
  const boards = useMemo(() => [...projects].sort(asc), [projects]);
  const shown = board === "all" ? boards : boards.filter((p) => p.id === board);
  const toggle = (t, done) => updateTodo(t.id, { done, doneAt: done ? Date.now() : null });
  const flip = (setter, key) => setter((s) => ({ ...s, [key]: !s[key] }));

  const createBoard = async () => {
    const name = boardName.trim();
    if (!name) return;
    await addProject({ name, color: BOARD_COLORS[projects.length % BOARD_COLORS.length], order: Date.now(), createdAt: Date.now() });
    setBoardName("");
    setNewBoard(false);
  };

  return (
    <>
      <TopBar title="待办">
        <button type="button" className="icon-btn" onClick={() => setNewBoard(true)} aria-label="新看板"><FolderPlus size={22} /></button>
      </TopBar>

      <div className="chip-row">
        <Chip active={board === "all"} onClick={() => setBoard("all")}>全部</Chip>
        {boards.map((p) => (
          <Chip key={p.id} active={board === p.id} color={p.color} onClick={() => setBoard(p.id)}>
            {p.name} <span className="muted" style={{ fontSize: 12 }}>{todos.filter((t) => t.projectId === p.id && !t.done).length}</span>
          </Chip>
        ))}
      </div>

      {shown.map((p) => {
        const mine = todos.filter((t) => t.projectId === p.id).sort(asc);
        const secs = sections.filter((s) => s.projectId === p.id).sort(asc);
        const known = new Set(secs.map((s) => s.id));
        const loose = mine.filter((t) => !t.done && (!t.sectionId || !known.has(t.sectionId)));
        const done = mine.filter((t) => t.done);
        const open = (t) => setSheet({ kind: "task", item: t });
        return (
          <section key={p.id} className="board">
            {board === "all" && (
              <h2 className="board__title"><span className="dot" style={{ background: p.color }} /> {p.name}</h2>
            )}
            {loose.map((t) => <TaskRow key={t.id} t={t} color={p.color} today={today} onToggle={toggle} onOpen={open} />)}
            <QuickAdd label="添加任务" placeholder="新任务…" onAdd={(text) => addTodo({ projectId: p.id, sectionId: null, text, done: false, createdAt: Date.now(), order: Date.now(), doDate: null, dueDate: null, startTime: null, endTime: null })} />

            {secs.map((s) => {
              const rows = mine.filter((t) => t.sectionId === s.id && !t.done);
              const closed = collapsed[s.id];
              return (
                <div key={s.id} className="sec">
                  <button type="button" className="sec__head" onClick={() => flip(setCollapsed, s.id)}>
                    {closed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <b>{s.name}</b>
                    <span className="muted">{rows.length}</span>
                  </button>
                  {!closed && (
                    <>
                      {rows.map((t) => <TaskRow key={t.id} t={t} color={p.color} today={today} onToggle={toggle} onOpen={open} />)}
                      <QuickAdd label="添加任务" placeholder={`加到「${s.name}」…`} onAdd={(text) => addTodo({ projectId: p.id, sectionId: s.id, text, done: false, createdAt: Date.now(), order: Date.now(), doDate: null, dueDate: null, startTime: null, endTime: null })} />
                    </>
                  )}
                </div>
              );
            })}

            <QuickAdd label="添加分区" placeholder="分区名,例如「本周要做」" onAdd={(name) => addSection({ projectId: p.id, name, order: Date.now() })} />

            {done.length > 0 && (
              <div className="sec">
                <button type="button" className="sec__head" onClick={() => flip(setShowDone, p.id)}>
                  {showDone[p.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <b className="muted">已完成</b><span className="muted">{done.length}</span>
                </button>
                {showDone[p.id] && done.map((t) => <TaskRow key={t.id} t={t} color={p.color} today={today} onToggle={toggle} onOpen={open} />)}
              </div>
            )}
          </section>
        );
      })}

      <button className="fab" type="button" onClick={() => setSheet({ kind: "task", projectId: board === "all" ? "" : board })} aria-label="新建待办"><Plus size={26} /></button>

      <Sheet open={newBoard} onClose={() => setNewBoard(false)} title="新看板">
        <input className="input" autoFocus placeholder="例如:学业、生活、项目" value={boardName} onChange={(e) => setBoardName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createBoard()} />
        <div className="sheet__actions">
          <button className="btn btn--text" type="button" onClick={() => setNewBoard(false)}>取消</button>
          <button className="btn" type="button" onClick={createBoard} disabled={!boardName.trim()}>创建</button>
        </div>
      </Sheet>

      {sheet && <CreateSheet key={sheet.item?.id || "new"} initial={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
