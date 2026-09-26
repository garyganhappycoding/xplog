"use client";
import { useState } from "react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
} from "@dnd-kit/core";
import { Plus, Pencil, X as XIcon, Check, Trash2 } from "lucide-react";

const NO_SECTION = "none";

function TodoCard({ todo, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [doDate, setDoDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: todo.id, disabled: editing });

  const startEdit = () => {
    setText(todo.text);
    setDoDate(todo.doDate || "");
    setDueDate(todo.dueDate || "");
    setEditing(true);
  };

  const save = async () => {
    if (!text.trim()) return;
    await onUpdate(todo.id, { text: text.trim(), doDate: doDate || null, dueDate: dueDate || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="xl-entry xl-card" style={{ cursor: "default" }}>
        <input className="xl-input" value={text} onChange={(e) => setText(e.target.value)} style={{ marginBottom: 8 }} autoFocus />
        <label className="xl-label">计划日期</label>
        <input className="xl-input" type="date" value={doDate} onChange={(e) => setDoDate(e.target.value)} style={{ marginBottom: 8 }} />
        <label className="xl-label">截止日期</label>
        <input className="xl-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={save} type="button">
            <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />保存
          </button>
          <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setEditing(false)} type="button">
            <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="xl-entry xl-card"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button
          className={`xl-todo-check ${todo.done ? "xl-todo-check--done" : ""}`}
          style={{ marginTop: 2 }}
          onClick={() => onUpdate(todo.id, { done: !todo.done })}
          type="button"
        >
          {todo.done && <Check size={12} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="xl-entry__text" style={{ textDecoration: todo.done ? "line-through" : "none", opacity: todo.done ? 0.5 : 1, wordBreak: "break-word" }}>
            {todo.text}
          </div>
          {(todo.doDate || todo.dueDate) && (
            <div className="xl-entry__meta" style={{ marginTop: 4 }}>
              {todo.doDate ? `计划 ${todo.doDate}` : ""}{todo.doDate && todo.dueDate ? " · " : ""}{todo.dueDate ? `截止 ${todo.dueDate}` : ""}
            </div>
          )}
        </div>
        <div className="xl-entry__actions" style={{ flexShrink: 0 }}>
          <button className="xl-entry__iconbtn" onClick={startEdit} type="button" title="编辑"><Pencil size={12} /></button>
          <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => onRemove(todo.id)} type="button" title="删除"><XIcon size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, count, section, onRename, onRemove }) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState("");

  const save = async () => {
    if (value.trim()) await onRename(section.id, value.trim());
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="xl-col__head">
        <input
          className="xl-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setRenaming(false); }}
          autoFocus
        />
        <button className="xl-entry__iconbtn" onClick={save} type="button" title="保存"><Check size={14} /></button>
      </div>
    );
  }

  return (
    <div className="xl-col__head">
      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline" }}>
        <span className="xl-col__title">{title}</span>
        <span className="xl-col__count">{count}</span>
      </div>
      {section && (
        <div className="xl-entry__actions">
          <button className="xl-entry__iconbtn" onClick={() => { setValue(section.name); setRenaming(true); }} type="button" title="重命名分区"><Pencil size={12} /></button>
          <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => onRemove(section)} type="button" title="删除分区"><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}

function AddTask({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    await onAdd(text.trim());
    setText("");
  };

  if (!open) {
    return (
      <button className="xl-pill xl-pill--dashed" style={{ width: "100%", justifyContent: "center" }} onClick={() => setOpen(true)} type="button">
        <Plus size={12} /> 添加任务
      </button>
    );
  }

  return (
    <div>
      <input
        className="xl-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setText(""); } }}
        placeholder="任务内容,回车添加"
        autoFocus
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={submit} type="button">添加</button>
        <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { setOpen(false); setText(""); }} type="button">取消</button>
      </div>
    </div>
  );
}

function Column({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`xl-col ${isOver ? "xl-col--over" : ""}`}>{children}</div>;
}

export default function TodoBoard({
  sections, todos,
  onAddTodo, onUpdateTodo, onRemoveTodo, onMoveTodo,
  onAddSection, onRenameSection, onRemoveSection,
}) {
  const [activeId, setActiveId] = useState(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

  const validIds = new Set(sections.map((s) => s.id));
  const columnOf = (t) => (t.sectionId && validIds.has(t.sectionId) ? t.sectionId : NO_SECTION);
  const sortTodos = (list) =>
    [...list].sort((a, b) => (a.done === b.done ? (a.createdAt || 0) - (b.createdAt || 0) : a.done ? 1 : -1));

  const columns = [
    { id: NO_SECTION, title: "未分区", section: null },
    ...sections.map((s) => ({ id: s.id, title: s.name, section: s })),
  ].map((c) => ({ ...c, todos: sortTodos(todos.filter((t) => columnOf(t) === c.id)) }));

  const activeTodo = todos.find((t) => t.id === activeId);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const todo = todos.find((t) => t.id === active.id);
    if (todo && columnOf(todo) !== over.id) onMoveTodo(todo.id, over.id === NO_SECTION ? null : over.id);
  };

  const submitSection = async () => {
    if (!sectionName.trim()) return;
    await onAddSection(sectionName.trim());
    setSectionName("");
    setAddingSection(false);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="xl-board">
        {columns.map((c) => (
          <Column key={c.id} id={c.id}>
            <SectionHead title={c.title} count={c.todos.length} section={c.section} onRename={onRenameSection} onRemove={onRemoveSection} />
            {c.todos.map((t) => (
              <TodoCard key={t.id} todo={t} onUpdate={onUpdateTodo} onRemove={onRemoveTodo} />
            ))}
            <AddTask onAdd={(text) => onAddTodo(c.section ? c.section.id : null, text)} />
          </Column>
        ))}

        <div className="xl-col xl-col--add">
          {addingSection ? (
            <div>
              <input
                className="xl-input"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitSection(); if (e.key === "Escape") setAddingSection(false); }}
                placeholder="分区名称,回车添加"
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={submitSection} type="button">添加</button>
                <button className="xl-btn--ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { setAddingSection(false); setSectionName(""); }} type="button">取消</button>
              </div>
            </div>
          ) : (
            <button className="xl-pill xl-pill--dashed" style={{ width: "100%", justifyContent: "center" }} onClick={() => setAddingSection(true)} type="button">
              <Plus size={12} /> 添加分区
            </button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeTodo ? <div className="xl-entry xl-card xl-card--overlay"><div className="xl-entry__text">{activeTodo.text}</div></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
