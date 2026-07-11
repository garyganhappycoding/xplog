"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { EFFORT_LABEL, xpGainForEntry, levelFromXp } from "@/lib/xp";
import { Pill, LevelUpSeal } from "@/components/ui";

export default function EntryPage() {
  const router = useRouter();
  const { data: skills, add: addSkill, update: updateSkill } = useCollection("skills");
  const { add: addEntry } = useCollection("entries");

  const [skillId, setSkillId] = useState("");
  const [result, setResult] = useState("success");
  const [time, setTime] = useState("medium");
  const [effort, setEffort] = useState("medium");
  const [value, setValue] = useState("");
  const [reflection, setReflection] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCurrentStatus, setNewCurrentStatus] = useState("");
  const [newHasValue, setNewHasValue] = useState(true);
  const [newMilestones, setNewMilestones] = useState([""]);
  const [levelUp, setLevelUp] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const activeSkillId = skillId || skills[0]?.id || "";
  const gained = xpGainForEntry(result, reflection);

  const saveSkill = async () => {
    if (!newName.trim()) return;
    const ref = await addSkill({
      name: newName.trim(),
      nameEn: newName.trim(),
      description: newDescription.trim(),
      currentStatus: newCurrentStatus.trim(),
      hasValue: newHasValue,
      milestones: newMilestones.map((m) => m.trim()).filter(Boolean),
      totalXp: 0,
    });
    setSkillId(ref.id);
    setShowCreate(false);
    setNewName("");
    setNewDescription("");
    setNewCurrentStatus("");
    setNewMilestones([""]);
  };

  const submit = async () => {
    const skill = skills.find((s) => s.id === activeSkillId);
    if (!skill) return;
    setSubmitting(true);
    const beforeLevel = levelFromXp(skill.totalXp || 0);
    const newTotal = (skill.totalXp || 0) + gained;
    const afterLevel = levelFromXp(newTotal);

    await updateSkill(skill.id, { totalXp: newTotal });
    await addEntry({
      skillId: skill.id,
      result,
      time,
      effort,
      value: value === "" ? null : Number(value),
      reflection,
      xpGained: gained,
      createdAt: Date.now(),
    });

    setSubmitting(false);
    setValue("");
    setReflection("");

    if (afterLevel > beforeLevel) {
      setLevelUp({ skillName: skill.name, level: afterLevel, skillId: skill.id });
    } else {
      router.push(`/skill/${skill.id}`);
    }
  };

  return (
    <>
      {levelUp && (
        <LevelUpSeal skillName={levelUp.skillName} level={levelUp.level} onDone={() => {
          const sid = levelUp.skillId;
          setLevelUp(null);
          router.push(`/skill/${sid}`);
        }} />
      )}

      <div className="xl-header"><div className="xl-title">新增记录</div></div>

      <div className="xl-field">
        <label className="xl-label">技能</label>
        <div className="xl-pillrow">
          {skills.map((s) => (
            <Pill key={s.id} active={activeSkillId === s.id} onClick={() => setSkillId(s.id)}>{s.name}</Pill>
          ))}
          <button className="xl-pill xl-pill--dashed" onClick={() => setShowCreate((v) => !v)} type="button">
            <Plus size={12} /> 新技能
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="xl-panel">
          <div className="xl-field">
            <label className="xl-label">标题</label>
            <input className="xl-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如:公开演讲" />
          </div>
          <div className="xl-field">
            <label className="xl-label">描述</label>
            <textarea className="xl-input" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="这个技能/项目是关于什么的?" />
          </div>
          <div className="xl-field">
            <label className="xl-label">当前状态</label>
            <textarea className="xl-input" value={newCurrentStatus} onChange={(e) => setNewCurrentStatus(e.target.value)} placeholder="现在进行到哪一步了?" />
          </div>
          <div className="xl-field">
            <label className="xl-label">是否需要计算 ROI(有金钱/数值产出)</label>
            <div className="xl-pillrow">
              <Pill small active={newHasValue} onClick={() => setNewHasValue(true)}>需要</Pill>
              <Pill small active={!newHasValue} onClick={() => setNewHasValue(false)}>不需要</Pill>
            </div>
          </div>
          <div className="xl-field">
            <label className="xl-label">定义每一级代表什么成就(可自行新增/删除等级)</label>
            {newMilestones.map((m, i) => (
              <div className="xl-milestone-row" key={i}>
                <span className="xl-milestone-lv">LV.{i + 1}</span>
                <input
                  className="xl-input"
                  style={{ flex: 1, minWidth: 0, width: "auto" }}
                  value={m}
                  onChange={(e) => { const arr = [...newMilestones]; arr[i] = e.target.value; setNewMilestones(arr); }}
                  placeholder={`第 ${i + 1} 级达成的具体成就...`}
                />
                {newMilestones.length > 1 && (
                  <button
                    type="button"
                    className="xl-btn--ghost"
                    style={{ padding: "6px 10px" }}
                    onClick={() => setNewMilestones(newMilestones.filter((_, idx) => idx !== i))}
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
              onClick={() => setNewMilestones([...newMilestones, ""])}
            >
              <Plus size={12} /> 新增等级
            </button>
          </div>
          <button className="xl-btn" onClick={saveSkill} type="button" style={{ marginTop: 12 }}>保存技能</button>
        </div>
      )}

      <div className="xl-field">
        <label className="xl-label">结果</label>
        <div className="xl-pillrow">
          <Pill active={result === "success"} onClick={() => setResult("success")}>成功</Pill>
          <Pill active={result === "fail"} onClick={() => setResult("fail")}>失败</Pill>
        </div>
      </div>
      <div className="xl-field">
        <label className="xl-label">时间付出</label>
        <div className="xl-pillrow">{["small", "medium", "large"].map((k) => <Pill key={k} active={time === k} onClick={() => setTime(k)}>{EFFORT_LABEL[k]}</Pill>)}</div>
      </div>
      <div className="xl-field">
        <label className="xl-label">精神努力</label>
        <div className="xl-pillrow">{["small", "medium", "large"].map((k) => <Pill key={k} active={effort === k} onClick={() => setEffort(k)}>{EFFORT_LABEL[k]}</Pill>)}</div>
      </div>
      <div className="xl-field">
        <label className="xl-label">产出价值(金额或自定义分数,可留空)</label>
        <input className="xl-input" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="例如 450" />
      </div>
      <div className="xl-field">
        <label className="xl-label">反省(可选 · 写反省额外 +50 XP)</label>
        <textarea className="xl-input" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="今天这件事哪里做得好?哪里可以调整?" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24 }}>
        <button className="xl-btn" onClick={submit} disabled={!activeSkillId || submitting} type="button">
          {submitting ? "提交中..." : `提交记录 · 预计 +${gained} XP`}
        </button>
      </div>
    </>
  );
}
