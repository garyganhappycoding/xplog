"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { ArrowLeft } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { progressInLevel, xpToReach, EFFORT_SCORE, EFFORT_LABEL } from "@/lib/xp";
import { ProgressBar } from "@/components/ui";

export default function SkillDetailPage() {
  const { id } = useParams();
  const { data: skills, loading } = useCollection("skills");
  const { data: allEntries } = useCollection("entries");

  const skill = skills.find((s) => s.id === id);
  const entries = allEntries.filter((e) => e.skillId === id);

  const { level, pct } = progressInLevel(skill?.totalXp || 0);

  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let running = 0;
    return sorted.map((e, i) => {
      running += e.xpGained || 0;
      return { d: `#${i + 1}`, xp: running };
    });
  }, [entries]);

  const roi = useMemo(() => {
    if (!skill?.hasValue) return null;
    const valued = entries.filter((e) => e.value !== null && e.value !== undefined);
    const totalValue = valued.reduce((a, e) => a + e.value, 0);
    const totalCost = entries.reduce((a, e) => a + (EFFORT_SCORE[e.time] || 0) + (EFFORT_SCORE[e.effort] || 0), 0);
    return totalCost ? (totalValue / totalCost).toFixed(2) : "—";
  }, [entries, skill]);

  if (loading) return <div className="xl-subtitle">加载中...</div>;
  if (!skill) {
    return (
      <>
        <Link className="xl-back" href="/dashboard"><ArrowLeft size={14} /> 返回总览</Link>
        <div className="xl-entry__empty">找不到这个技能。</div>
      </>
    );
  }

  return (
    <>
      <Link className="xl-back" href="/dashboard"><ArrowLeft size={14} /> 返回总览</Link>
      <div className="xl-header">
        <div>
          <div className="xl-title">{skill.name} <span className="xl-mono" style={{ fontSize: 13, color: "var(--muted)" }}>{skill.nameEn}</span></div>
          <div className="xl-subtitle">LV.{level} · {skill.totalXp || 0} XP 累计</div>
        </div>
      </div>
      <ProgressBar pct={pct} tall />
      <div className="xl-subtitle" style={{ marginTop: 6, marginBottom: 20 }}>距下一级还差 {xpToReach(level + 1) - (skill.totalXp || 0)} XP</div>

      {skill.milestones && (
        <div className="xl-panel">
          <div className="xl-label" style={{ marginBottom: 10 }}>等级成就(Lv.1 → Lv.5)</div>
          {skill.milestones.map((m, i) => (
            <div className="xl-milestone-row" key={i}>
              <span className="xl-milestone-lv">LV.{i + 1}</span>
              <span style={{ fontSize: 13, opacity: level >= i + 1 ? 1 : 0.5 }}>{level >= i + 1 ? "✓ " : "· "}{m}</span>
            </div>
          ))}
        </div>
      )}

      <div className="xl-stat-row">
        <div><div className="xl-stat__num">{entries.length}</div><div className="xl-stat__label">记录次数</div></div>
        <div><div className="xl-stat__num">{entries.filter((e) => e.result === "success").length}</div><div className="xl-stat__label">成功</div></div>
        {skill.hasValue && <div><div className="xl-stat__num">{roi}</div><div className="xl-stat__label">ROI(价值/投入)</div></div>}
      </div>

      {chartData.length > 0 && (
        <div style={{ height: 160, marginBottom: 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(201,162,75,0.1)" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: "#92897A", fontSize: 10 }} axisLine={{ stroke: "rgba(201,162,75,0.15)" }} tickLine={false} />
              <YAxis tick={{ fill: "#92897A", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={{ background: "#1B1712", border: "1px solid rgba(201,162,75,0.25)", fontSize: 12, borderRadius: 4 }} labelStyle={{ color: "#EDE4D1" }} />
              <Line type="monotone" dataKey="xp" stroke="#E9C877" strokeWidth={2} dot={{ r: 3, fill: "#E9C877" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="xl-label" style={{ marginBottom: 12 }}>记录明细</div>
      {entries.map((e) => (
        <div className="xl-entry" key={e.id}>
          <div className="xl-entry__top">
            <span className={`xl-tag ${e.result === "success" ? "xl-tag--success" : "xl-tag--fail"}`}>
              {e.result === "success" ? "成功 +10" : "失败 +1"}{e.reflection ? " · 反省 +50" : ""}
            </span>
            <span className="xl-entry__meta">
              时间{EFFORT_LABEL[e.time]} / 精力{EFFORT_LABEL[e.effort]}{e.value ? ` · ¥${e.value}` : ""}
            </span>
          </div>
          {e.reflection ? <div className="xl-entry__text">{e.reflection}</div> : <div className="xl-entry__empty">未写反省</div>}
        </div>
      ))}
      {entries.length === 0 && <div className="xl-entry__empty">这个技能还没有记录。</div>}
    </>
  );
}
