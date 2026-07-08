"use client";
import { useCollection } from "@/lib/useCollection";

export default function ReflectionsPage() {
  const { data: entries } = useCollection("entries", "createdAt");
  const { data: skills } = useCollection("skills");

  const withReflection = entries.filter((e) => e.reflection && e.reflection.trim());
  const skillName = (id) => skills.find((s) => s.id === id)?.name || id;

  return (
    <>
      <div className="xl-header">
        <div>
          <div className="xl-title">反省回顾</div>
          <div className="xl-subtitle">共 {withReflection.length} 篇 · 按时间倒序</div>
        </div>
      </div>
      {withReflection.map((e) => (
        <div className="xl-entry" key={e.id}>
          <div className="xl-entry__top">
            <span className={`xl-tag ${e.result === "success" ? "xl-tag--success" : "xl-tag--fail"}`}>{skillName(e.skillId)}</span>
          </div>
          <div className="xl-entry__text">{e.reflection}</div>
        </div>
      ))}
      {withReflection.length === 0 && <div className="xl-entry__empty">还没有反省记录</div>}
    </>
  );
}
