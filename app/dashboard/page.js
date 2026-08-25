"use client";
import { useMemo } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useCollection } from "@/lib/useCollection";
import { levelFromXp } from "@/lib/xp";

export default function DashboardPage() {
  const { data: skills, loading: skillsLoading } = useCollection("skills");
  const { data: entries } = useCollection("entries");
  const totalReflections = entries.filter((e) => e.reflection && e.reflection.trim()).length;

  const radarData = useMemo(
    () => skills.map((s) => ({
      subject: `${s.icon ? `${s.icon} ` : ""}${s.name}`,
      level: levelFromXp(s.totalXp || 0),
    })),
    [skills]
  );
  const radarMax = Math.max(5, ...radarData.map((d) => d.level));

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
          <div className="xl-subtitle" style={{ marginBottom: 16 }}>从左边导航栏点一个技能开始打卡,或者点「+ 新增」建立新的。</div>
          {radarData.length >= 3 && (
            <div className="xl-panel xl-radar-panel">
              <div className="xl-label" style={{ marginBottom: 4 }}>能力雷达</div>
              <div className="xl-radar">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="rgba(201,162,75,0.18)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#EDE4D1", fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, radarMax]} tick={{ fill: "#92897A", fontSize: 10 }} tickCount={Math.min(radarMax, 5) + 1} axisLine={false} />
                    <Radar name="等级" dataKey="level" stroke="#E9C877" fill="#E9C877" fillOpacity={0.32} />
                    <Tooltip contentStyle={{ background: "#1B1712", border: "1px solid rgba(201,162,75,0.25)", fontSize: 12, borderRadius: 4 }} labelStyle={{ color: "#EDE4D1" }} formatter={(v) => [`LV.${v}`, "等级"]} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
