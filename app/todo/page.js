"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { ConfirmDialog } from "@/components/ui";
import TodoBoard from "@/components/TodoBoard";

const COLOR_PRESETS = ["#C9A24B", "#5C8A72", "#A23B3B", "#7A8AC9", "#92897A", "#B07AA1", "#D08C5A"];

export default function TodoPage() {
  const { data: projects, add: addProject, update: updateProject, remove: removeProject } = useCollection("projects", "order");
  const { data: todos, add: addTodo, update: updateTodo, remove: removeTodo } = useCollection("todos");
  const { data: allSections, add: addSection, update: updateSection, remove: removeSection } = useCollection("sections");

  const [activeProjectId, setActiveProjectId] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(COLOR_PRESETS[0]);

  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PRESETS[0]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState(null);

  useEffect(() => {
    if (!activeProjectId && projects.length) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId]);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const projectTodos = todos.filter((t) => t.projectId === activeProjectId);
  const projectSections = allSections
    .filter((s) => s.projectId === activeProjectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

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

  const startEditProject = () => {
    setEditName(activeProject.name);
    setEditColor(activeProject.color || COLOR_PRESETS[0]);
    setEditingProject(true);
  };

  const saveProject = async () => {
    await updateProject(activeProject.id, { name: editName.trim() || activeProject.name, color: editColor });
    setEditingProject(false);
  };

  const confirmDeleteProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const doomedTodos = todos.filter((t) => t.projectId === deleteTarget.id);
    const doomedSections = allSections.filter((s) => s.projectId === deleteTarget.id);
    await Promise.all([
      ...doomedTodos.map((t) => removeTodo(t.id)),
      ...doomedSections.map((s) => removeSection(s.id)),
    ]);
    await removeProject(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    setEditingProject(false);
    if (activeProjectId === deleteTarget.id) setActiveProjectId("");
  };

  const confirmDeleteSection = async () => {
    if (!deleteSectionTarget) return;
    await Promise.all(
      todos.filter((t) => t.sectionId === deleteSectionTarget.id).map((t) => updateTodo(t.id, { sectionId: null }))
    );
    await removeSection(deleteSectionTarget.id);
    setDeleteSectionTarget(null);
  };

  const sectionTodoCount = (sectionId) => todos.filter((t) => t.sectionId === sectionId).length;

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `删除项目「${deleteTarget.name}」?` : ""}
        message={
          deleteTarget
            ? `这会永久删除这个项目以及它的 ${todos.filter((t) => t.projectId === deleteTarget.id).length} 个待办事项和 ${allSections.filter((s) => s.projectId === deleteTarget.id).length} 个分区,无法恢复。`
            : ""
        }
        confirmLabel={deleting ? "删除中..." : "确认删除"}
        onConfirm={confirmDeleteProject}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteSectionTarget}
        title={deleteSectionTarget ? `删除分区「${deleteSectionTarget.name}」?` : ""}
        message={deleteSectionTarget ? `这个分区里的 ${sectionTodoCount(deleteSectionTarget.id)} 个待办不会被删除,会移到「未分区」。` : ""}
        confirmLabel="确认删除"
        onConfirm={confirmDeleteSection}
        onCancel={() => setDeleteSectionTarget(null)}
      />

      <div className="xl-header"><div className="xl-title">待办</div></div>

      <div className="xl-projects">
        {projects.map((p) => {
          const list = todos.filter((t) => t.projectId === p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={`xl-projcard ${activeProjectId === p.id ? "xl-projcard--active" : ""}`}
              style={{ "--proj-color": p.color || "var(--muted)" }}
              onClick={() => { setActiveProjectId(p.id); setEditingProject(false); }}
            >
              <span className="xl-projcard__name">{p.name}</span>
              <span className="xl-projcard__meta">{list.filter((t) => !t.done).length} 项未完成 · 共 {list.length} 项</span>
            </button>
          );
        })}
        <button className="xl-projcard xl-projcard--add" onClick={() => setShowNewProject((v) => !v)} type="button">
          <Plus size={14} /> 新建项目
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
          <div className="xl-project-head">
            <div className="xl-title" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="xl-project-dot xl-project-dot--lg" style={{ background: activeProject.color || "var(--muted)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{activeProject.name}</span>
            </div>
            {!editingProject && (
              <button className="xl-btn--ghost" onClick={startEditProject} type="button" style={{ flexShrink: 0 }}>
                <Pencil size={12} style={{ marginRight: 6, verticalAlign: -2 }} />编辑项目
              </button>
            )}
          </div>
          <div className="xl-subtitle" style={{ marginBottom: 6 }}>
            {projectTodos.filter((t) => !t.done).length} 项未完成 · 共 {projectTodos.length} 项 · 可拖动卡片到别的分区
          </div>

          {editingProject && (
            <div className="xl-panel" style={{ marginTop: 14 }}>
              <div className="xl-field">
                <label className="xl-label">项目名称</label>
                <input className="xl-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
              </div>
              <div className="xl-field">
                <label className="xl-label">颜色</label>
                <div className="xl-pillrow">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="xl-color-swatch"
                      style={{ background: c, outline: editColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                      onClick={() => setEditColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="xl-btn" onClick={saveProject} type="button">保存</button>
                <button className="xl-btn--ghost" onClick={() => setEditingProject(false)} type="button">取消</button>
                <button className="xl-btn--ghost xl-btn--danger" style={{ marginLeft: "auto" }} onClick={() => setDeleteTarget(activeProject)} type="button">
                  <Trash2 size={12} style={{ marginRight: 6, verticalAlign: -2 }} />删除项目
                </button>
              </div>
            </div>
          )}

          <TodoBoard
            sections={projectSections}
            todos={projectTodos}
            onAddTodo={(sectionId, text) => {
              const now = Date.now();
              return addTodo({ projectId: activeProjectId, sectionId, text, done: false, createdAt: now, order: now, doDate: null, dueDate: null });
            }}
            onUpdateTodo={updateTodo}
            onRemoveTodo={removeTodo}
            onAddSection={(name) => addSection({ projectId: activeProjectId, name, order: projectSections.length, createdAt: Date.now() })}
            onRenameSection={(id, name) => updateSection(id, { name })}
            onRemoveSection={setDeleteSectionTarget}
          />
        </>
      )}

      {!activeProject && projects.length === 0 && (
        <div className="xl-panel">还没有项目。点上面「+ 新建项目」创建第一个吧。</div>
      )}
    </>
  );
}
