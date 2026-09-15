"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, ChevronRight } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { levelFromXp } from "@/lib/xp";
import CreateSkillForm from "@/components/CreateSkillForm";

export default function SkillsPage() {
  const { data: skills, add: addSkill, loading: skillsLoading } = useCollection("skills");
  const { data: entries } = useCollection("entries");
  const [showCreate, setShowCreate] = useState(false);

  const radarData = useMemo(
    () =>
      skills.map((s) => ({
        skill: s.name.length > 6 ? `${s.name.slice(0, 6)}…` : s.name,
        fullName: s.name,
        level: levelFromXp(s.totalXp || 0),
      })),
    [skills]
  );
  const maxLevel = radarData.reduce((m, d) => Math.max(m, d.level), 0);
  const radiusMax = Math.max(5, maxLevel + 1);

  return (
    <>
      <div className="xl-header">
        <div className="xl-title">技能与成长</div>
        <button className="xl-btn--ghost" onClick={() => setShowCreate((v) => !v)} type="button">
          <Plus size={12} style={{ marginRight: 6, verticalAlign: -2 }} />新技能
        </button>
      </div>

      {showCreate && (
        <CreateSkillForm addSkill={addSkill} onCreated={() => setShowCreate(false)} />
      )}

      {!skillsLoading && skills.length === 0 ? (
        <div className="xl-panel">还没有技能。点右上角「+ 新技能」创建第一个吧,或者在「日记」页写篇日记,AI 会自动帮你建。</div>
      ) : (
        <>
          {radarData.length >= 3 && (
            <div className="xl-panel">
              <div className="xl-label" style={{ marginBottom: 10 }}>技能雷达图</div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="rgba(201,162,75,0.18)" />
                    <PolarAngleAxis dataKey="skill" tick={{ fill: "#EDE4D1", fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, radiusMax]} tickCount={radiusMax + 1} tick={{ fill: "#92897A", fontSize: 10 }} />
                    <Radar dataKey="level" stroke="#E9C877" fill="#E9C877" fillOpacity={0.28} strokeWidth={2} />
                    <Tooltip
                      contentStyle={{ background: "#1B1712", border: "1px solid rgba(201,162,75,0.25)", fontSize: 12, borderRadius: 4 }}
                      labelStyle={{ color: "#EDE4D1" }}
                      formatter={(value, name, props) => [`LV.${value}`, props.payload.fullName]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="xl-ledger">
            {skills.map((s) => {
              const level = levelFromXp(s.totalXp || 0);
              const count = entries.filter((e) => e.skillId === s.id).length;
              return (
                <Link className="xl-row" key={s.id} href={`/skill/${s.id}`}>
                  <div className="xl-row__idx">{s.icon || "✦"}</div>
                  <div className="xl-row__name">
                    {s.name}
                    <small>{count} 条记录</small>
                  </div>
                  <div className="xl-row__lvl">LV.{level}</div>
                  <div className="xl-row__pct">{s.totalXp || 0} XP</div>
                  <ChevronRight size={16} className="xl-row__chev" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
