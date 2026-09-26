"use client";
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";

function ProjectCard({ project, todos, active, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const list = todos.filter((t) => t.projectId === project.id);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className={`xl-projcard ${active ? "xl-projcard--active" : ""}`}
      style={{
        "--proj-color": project.color || "var(--muted)",
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 2 : undefined,
      }}
      onClick={() => onSelect(project.id)}
    >
      <span className="xl-projcard__name">{project.name}</span>
      <span className="xl-projcard__meta">{list.filter((t) => !t.done).length} 项未完成 · 共 {list.length} 项</span>
    </button>
  );
}

// `projects` arrives in display order (first = leftmost). Dragging rewrites `order`
// so that display order stays "highest order first", as the page already sorts.
export default function ProjectCards({ projects, todos, activeId, onSelect, onReorder, onNew }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={projects.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div className="xl-projects">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} todos={todos} active={activeId === p.id} onSelect={onSelect} />
          ))}
          <button className="xl-projcard xl-projcard--add" onClick={onNew} type="button">
            <Plus size={14} /> 新建项目
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
