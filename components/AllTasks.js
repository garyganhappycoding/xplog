"use client";
import { Check } from "lucide-react";

// Every not-done task across all projects, grouped by the board it comes from.
export default function AllTasks({ projects, todos, onToggle, onOpenProject }) {
  const orderKey = (t) => (typeof t.order === "number" ? t.order : t.createdAt || 0);
  const pending = todos.filter((t) => !t.done);
  const groups = projects
    .map((p) => ({ project: p, items: pending.filter((t) => t.projectId === p.id).sort((a, b) => orderKey(a) - orderKey(b)) }))
    .filter((g) => g.items.length);

  if (!groups.length) return <div className="xl-panel">所有项目都完成啦 🎉</div>;

  return (
    <div className="xl-board">
      {groups.map(({ project, items }) => (
        <div key={project.id} className="xl-col">
          <div className="xl-col__head">
            <button
              type="button"
              className="xl-col__title"
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
              onClick={() => onOpenProject(project.id)}
              title="打开这个项目的看板"
            >
              <span className="xl-project-dot" style={{ background: project.color || "var(--muted)" }} />
              {project.name}
            </button>
            <span className="xl-col__count">{items.length}</span>
          </div>
          {items.map((t) => (
            <div key={t.id} className="xl-entry xl-card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <button className="xl-todo-check" style={{ marginTop: 2 }} onClick={() => onToggle(t.id, { done: true })} type="button">
                  {t.done && <Check size={12} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="xl-entry__text" style={{ wordBreak: "break-word" }}>{t.text}</div>
                  {(t.doDate || t.dueDate) && (
                    <div className="xl-entry__meta" style={{ marginTop: 4 }}>
                      {t.doDate ? `计划 ${t.doDate}` : ""}{t.doDate && t.dueDate ? " · " : ""}{t.dueDate ? `截止 ${t.dueDate}` : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
