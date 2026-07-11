"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { progressInLevel, xpToReach, EFFORT_SCORE, EFFORT_LABEL } from "@/lib/xp";
import { ProgressBar, Pill } from "@/components/ui";

export default function SkillDetailPage() {
  const { id } = useParams();
  const { data: skills, loading, update: updateSkill } = useCollection("skills");
  const { data: allEntries } = useCollection("entries");

  const skill = skills.find((s) => s.id === id);
  const entries = allEntries.filter((e) => e.skillId === id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [milestones, setMilestones] = useState([""]);
  const [hasValue, setHasValue] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (skill && !editing) {
      setName(skill.name || "");
      setDescription(skill.description || "");
      setCurrentStatus(skill.currentStatus || "");
      setMilestones(skill.milestones && skill.milestones.length ? [...skill.milestones] : [""]);
      setHasValue(!!skill.hasValue);
    }
  }, [skill, editing]);

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

  const startEdit = () => setEditing(true);
  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    setSaving(true);
    await updateSkill(skill.id, {
      name: name.trim() || skill.name,
      nameEn: name.trim() || skill.name,
      description: description.trim(),
      currentStatus: currentStatus.trim(),
      hasValue,
      milestones: milestones.map((m) => m.trim()).filter(Boolean),
    });
    setSaving(false);
    setEditing(false);
  };

  return (
    <>
      <Link className="xl-back" href="/dashboard"><ArrowLeft size={14} /> 返回总览</Link>

      {!editing && (
        <div className="xl-header">
          <div>
            <div className="xl-title">{skill.name}</div>
            <div className="xl-subtitle">LV.{level} · {skill.totalXp || 0} XP 累计</div>
          </div>
          <button className="xl-btn--ghost" onClick={startEdit} type="button">
            <Pencil size={12} style={{ marginRight: 6, verticalAlign: -2 }} />编辑
          </button>
        </div>
      )}

      {!editing && skill.description && (
        <div className="xl-panel">
          <div className="xl-label" style={{ marginBottom: 6 }}>描述</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>{skill.description}</div>
        </div>
      )}

      {!editing && (
        <div className="xl-panel">
          <div className="xl-label" style={{ marginBottom: 6 }}>当前状态</div>
          {skill.currentStatus
            ? <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>{skill.currentStatus}</div>
            : <div className="xl-entry__empty">还没有填写当前状态,点右上角「编辑」加上去。</div>}
        </div>
      )}

      {editing && (
        <div className="xl-panel">
          <div className="xl-field">
            <label className="xl-label">标题</label>
            <input className="xl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="技能名称" />
          </div>
          <div className="xl-field">
            <label className="xl-label">描述</label>
            <textarea className="xl-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个技能/项目是关于什么的?" />
          </div>
          <div className="xl-field">
            <label className="xl-label">当前状态</label>
            <textarea className="xl-input" value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} placeholder="现在进行到哪一步了?" />
          </div>
          <div className="xl-field">
            <label className="xl-label">是否需要计算 ROI(有金钱/数值产出)</label>
            <div className="xl-pillrow">
              <Pill small active={hasValue} onClick={() => setHasValue(true)}>需要</Pill>
              <Pill small active={!hasValue} onClick={() => setHasValue(false)}>不需要</Pill>
            </div>
          </div>
          <div className="xl-field">
            <label className="xl-label">等级成就(可自行新增/删除等级)</label>
            {milestones.map((m, i) => (
              <div className="xl-milestone-row" key={i}>
                <span className="xl-milestone-lv">LV.{i + 1}</span>
                <input
                  className="xl-input"
                  style={{ flex: 1, minWidth: 0, width: "auto" }}
                  value={m}
                  onChange={(e) => { const arr = [...milestones]; arr[i] = e.target.value; setMilestones(arr); }}
                  placeholder={`第 ${i + 1} 级达成的具体成就...`}
                />
                {milestones.length > 1 && (
                  <button
                    type="button"
                    className="xl-btn--ghost"
                    style={{ padding: "6px 10px" }}
                    onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="xl-pill xl-pill--dashed"
              style={{ marginTop: 4 }}
              onClick={() => setMilestones([...milestones, ""])}
            >
              <Plus size={12} /> 新增等级
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="xl-btn" onClick={saveEdit} disabled={saving} type="button">{saving ? "保存中..." : "保存修改"}</button>
            <button className="xl-btn--ghost" onClick={cancelEdit} type="button">取消</button>
          </div>
        </div>
      )}

      {!editing && (
        <>
          <ProgressBar pct={pct} tall />
          <div className="xl-subtitle" style={{ marginTop: 6, marginBottom: 20 }}>距下一级还差 {xpToReach(level + 1) - (skill.totalXp || 0)} XP</div>

          {skill.milestones && skill.milestones.length > 0 && (
            <div className="xl-panel">
              <div className="xl-label" style={{ marginBottom: 10 }}>等级成就(Lv.1 → Lv.{skill.milestones.length})</div>
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
      )}
    </>
  );
}
