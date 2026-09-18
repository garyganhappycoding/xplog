"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, X as XIcon, Check, Trash2 } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { Pill, ConfirmDialog } from "@/components/ui";

const COLOR_PRESETS = ["#C9A24B", "#5C8A72", "#A23B3B", "#7A8AC9", "#92897A"];

export default function TodoPage() {
  const { data: projects, add: addProject, update: updateProject, remove: removeProject } = useCollection("projects", "order");
  const { data: todos, add: addTodo, update: updateTodo, remove: removeTodo } = useCollection("todos");

  const [activeProjectId, setActiveProjectId] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(COLOR_PRESETS[0]);

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [newTodoText, setNewTodoText] = useState("");

  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editTodoText, setEditTodoText] = useState("");
  const [editDoDate, setEditDoDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [savingTodo, setSavingTodo] = useState(false);

  useEffect(() => {
    if (!activeProjectId && projects.length) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectTodos = todos.filter((t) => t.projectId === activeProjectId);
  const todoCount = (projectId) => todos.filter((t) => t.projectId === projectId).length;

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const ref = await addProject({
      name: newProjectName.trim(),
      color: newProjectColor,
      createdAt: Date.now(),
      order: projects.length,
    });
    setActiveProjectId(ref.id);
    setNewProjectName("");
    setNewProjectColor(COLOR_PRESETS[0]);
    setShowNewProject(false);
  };

  const startRename = (p) => { setRenamingId(p.id); setRenameValue(p.name); };
  const saveRename = async (p) => {
    if (renameValue.trim()) await updateProject(p.id, { name: renameValue.trim() });
    setRenamingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const toRemove = todos.filter((t) => t.projectId === deleteTarget.id);
    await Promise.all(toRemove.map((t) => removeTodo(t.id)));
    await removeProject(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (activeProjectId === deleteTarget.id) setActiveProjectId("");
  };

  const submitTodo = async () => {
    if (!newTodoText.trim() || !activeProjectId) return;
    await addTodo({ projectId: activeProjectId, text: newTodoText.trim(), done: false, createdAt: Date.now(), doDate: null, dueDate: null });
    setNewTodoText("");
  };

  const startEditTodo = (t) => {
    setEditingTodoId(t.id);
    setEditTodoText(t.text);
    setEditDoDate(t.doDate || "");
    setEditDueDate(t.dueDate || "");
  };

  const saveEditTodo = async (t) => {
    if (!editTodoText.trim()) return;
    setSavingTodo(true);
    await updateTodo(t.id, {
      text: editTodoText.trim(),
      doDate: editDoDate || null,
      dueDate: editDueDate || null,
    });
    setSavingTodo(false);
    setEditingTodoId(null);
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `删除项目「${deleteTarget.name}」?` : ""}
        message={deleteTarget ? `这会永久删除这个项目以及它的 ${todoCount(deleteTarget.id)} 个待办事项,无法恢复。` : ""}
        confirmLabel={deleting ? "删除中..." : "确认删除"}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="xl-header"><div className="xl-title">待办</div></div>

      <div className="xl-pillrow" style={{ marginBottom: 16 }}>
        {projects.map((p) => (
          <Pill key={p.id} active={activeProjectId === p.id} onClick={() => setActiveProjectId(p.id)}>
            <span className="xl-project-dot" style={{ background: p.color || "var(--muted)" }} />
            {p.name}
          </Pill>
        ))}
        <button className="xl-pill xl-pill--dashed" onClick={() => setShowNewProject((v) => !v)} type="button">
          <Plus size={12} /> 新建项目
        </button>
      </div>

      {showNewProject && (
        <div className="xl-panel">
          <div className="xl-field">
            <label className="xl-label">项目名称</label>
            <input className="xl-input" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="例如:Daily / 阅读清单 / 帮小明学习" />
          </div>
          <div className="xl-field">
            <label className="xl-label">颜色(可选)</label>
            <div className="xl-pillrow">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="xl-color-swatch"
                  style={{ background: c, outline: newProjectColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                  onClick={() => setNewProjectColor(c)}
                />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="xl-btn" onClick={createProject} type="button">保存</button>
            <button className="xl-btn--ghost" onClick={() => setShowNewProject(false)} type="button">取消</button>
          </div>
        </div>
      )}

      {activeProject && (
        <>
          <div className="xl-header" style={{ marginBottom: 14 }}>
            {renamingId === activeProject.id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="xl-input" style={{ width: "auto" }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                <button className="xl-entry__iconbtn" onClick={() => saveRename(activeProject)} type="button" title="保存"><Check size={14} /></button>
                <button className="xl-entry__iconbtn" onClick={() => setRenamingId(null)} type="button" title="取消"><XIcon size={14} /></button>
              </div>
            ) : (
              <div className="xl-subtitle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {projectTodos.filter((t) => !t.done).length} 项未完成 · 共 {projectTodos.length} 项
                <button className="xl-entry__iconbtn" onClick={() => startRename(activeProject)} type="button" title="重命名"><Pencil size={12} /></button>
                <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => setDeleteTarget(activeProject)} type="button" title="删除项目"><Trash2 size={12} /></button>
              </div>
            )}
          </div>

          <div className="xl-field" style={{ display: "flex", gap: 10 }}>
            <input
              className="xl-input"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitTodo(); }}
              placeholder="添加待办事项..."
            />
            <button className="xl-btn--ghost" onClick={submitTodo} type="button">添加</button>
          </div>

          {projectTodos.map((t) => (
            <div className="xl-entry" key={t.id} style={{ padding: "10px 14px" }}>
              {editingTodoId === t.id ? (
                <div>
                  <input
                    className="xl-input"
                    value={editTodoText}
                    onChange={(e) => setEditTodoText(e.target.value)}
                    style={{ marginBottom: 10 }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label className="xl-label">计划日期</label>
                      <input className="xl-input" type="date" value={editDoDate} onChange={(e) => setEditDoDate(e.target.value)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label className="xl-label">截止日期</label>
                      <input className="xl-input" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveEditTodo(t)} disabled={savingTodo} type="button">
                      <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{savingTodo ? "保存中..." : "保存"}
                    </button>
                    <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingTodoId(null)} type="button">
                      <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    className={`xl-todo-check ${t.done ? "xl-todo-check--done" : ""}`}
                    onClick={() => updateTodo(t.id, { done: !t.done })}
                    type="button"
                  >
                    {t.done && <Check size={12} />}
                  </button>
                  <div style={{ flex: 1, cursor: "pointer", minWidth: 0 }} onClick={() => startEditTodo(t)}>
                    <div className="xl-entry__text" style={{ textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>
                      {t.text}
                    </div>
                    {(t.doDate || t.dueDate) && (
                      <div className="xl-entry__meta" style={{ marginTop: 4 }}>
                        {t.doDate ? `计划 ${t.doDate}` : ""}{t.doDate && t.dueDate ? " · " : ""}{t.dueDate ? `截止 ${t.dueDate}` : ""}
                      </div>
                    )}
                  </div>
                  <button className="xl-entry__iconbtn" onClick={() => startEditTodo(t)} type="button" title="编辑"><Pencil size={12} /></button>
                  <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => removeTodo(t.id)} type="button" title="删除"><XIcon size={12} /></button>
                </div>
              )}
            </div>
          ))}
          {projectTodos.length === 0 && <div className="xl-entry__empty">这个项目还没有待办事项。</div>}
        </>
      )}

      {!activeProject && projects.length === 0 && (
        <div className="xl-panel">还没有项目。点上面「+ 新建项目」创建第一个吧。</div>
      )}
    </>
  );
}
