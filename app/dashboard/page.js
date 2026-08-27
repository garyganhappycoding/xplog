"use client";
import { useMemo } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";
import { useCollection } from "@/lib/useCollection";
import { levelFromXp } from "@/lib/xp";

export default function DashboardPage() {
  const { data: skills, loading: skillsLoading } = useCollection("skills");
  const { data: entries } = useCollection("entries");
  const totalReflections = entries.filter((e) => e.reflection && e.reflection.trim()).length;

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
        <div>
          <div className="xl-title">今日总览</div>
          <div className="xl-subtitle">{new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</div>
        </div>
      </div>
      <div className="xl-stat-row">
        <div><div className="xl-stat__num">{skills.length}</div><div className="xl-stat__label">追踪技能</div></div>
        <div><div className="xl-stat__num">{entries.length}</div><div className="xl-stat__label">总记录数</div></div>
        <div><div className="xl-stat__num">{totalReflections}</div><div className="xl-stat__label">已写反省</div></div>
      </div>

      {!skillsLoading && skills.length === 0 ? (
        <div className="xl-panel">还没有技能。点左边导航栏最下面的「+ 新增」创建你的第一个技能吧。</div>
      ) : (
        <>
          <div className="xl-subtitle" style={{ marginBottom: 14 }}>从左边导航栏点一个技能开始打卡,或者点「+ 新增」建立新的。</div>

          {radarData.length >= 3 ? (
            <div className="xl-panel">
              <div className="xl-label" style={{ marginBottom: 10 }}>技能雷达图</div>
              <div style={{ height: 340 }}>
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
          ) : (
            radarData.length > 0 && (
              <div className="xl-panel">
                <div className="xl-entry__empty">还需至少 3 个技能才能生成雷达图(目前 {radarData.length} 个)。</div>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}