"use client";
import { useMemo } from "react";
import { useCollection } from "@/lib/useCollection";
import ExpandableText from "@/components/ExpandableText";

export default function ReflectionsPage() {
  const { data: entries } = useCollection("entries", "createdAt");
  const { data: diaryEntries } = useCollection("diaryEntries", "createdAt");
  const { data: skills } = useCollection("skills");

  const skillName = (id) => skills.find((s) => s.id === id)?.name || id;

  // A diary entry is itself a reflection, so it's merged in alongside manual
  // entries that have a written reflection.
  const combined = useMemo(() => {
    const fromEntries = entries
      .filter((e) => e.reflection && e.reflection.trim())
      .map((e) => ({ id: `entry-${e.id}`, text: e.reflection, skillId: e.skillId, createdAt: e.createdAt, result: e.result }));
    const fromDiary = diaryEntries.map((e) => ({
      id: `diary-${e.id}`,
      text: e.text,
      skillId: e.skillId,
      createdAt: e.createdAt,
      result: null,
    }));
    return [...fromEntries, ...fromDiary].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [entries, diaryEntries]);

  return (
    <>
      <div className="xl-header">
        <div>
          <div className="xl-title">反省回顾</div>
          <div className="xl-subtitle">共 {combined.length} 篇 · 按时间倒序</div>
        </div>
      </div>
      {combined.map((e) => (
        <div className="xl-entry" key={e.id}>
          <div className="xl-entry__top">
            <span className={`xl-tag ${e.result === "fail" ? "xl-tag--fail" : "xl-tag--success"}`}>
              {skillName(e.skillId)}{e.result === null ? " · 日记" : ""}
            </span>
          </div>
          <ExpandableText text={e.text} />
        </div>
      ))}
      {combined.length === 0 && <div className="xl-entry__empty">还没有反省记录</div>}
    </>
  );
}
