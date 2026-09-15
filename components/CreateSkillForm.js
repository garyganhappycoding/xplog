"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Pill } from "@/components/ui";
import EmojiPicker from "@/components/EmojiPicker";

export default function CreateSkillForm({ addSkill, onCreated }) {
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("✦");
  const [newDescription, setNewDescription] = useState("");
  const [newCurrentStatus, setNewCurrentStatus] = useState("");
  const [newHasValue, setNewHasValue] = useState(true);
  const [newMilestones, setNewMilestones] = useState([""]);
  const [saving, setSaving] = useState(false);

  const saveSkill = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const ref = await addSkill({
      name: newName.trim(),
      nameEn: newName.trim(),
      icon: newIcon.trim() || "✦",
      description: newDescription.trim(),
      currentStatus: newCurrentStatus.trim(),
      hasValue: newHasValue,
      milestones: newMilestones.map((m) => m.trim()).filter(Boolean),
      totalXp: 0,
    });
    setSaving(false);
    setNewName("");
    setNewIcon("✦");
    setNewDescription("");
    setNewCurrentStatus("");
    setNewHasValue(true);
    setNewMilestones([""]);
    onCreated?.(ref.id);
  };

  return (
    <div className="xl-panel">
      <div className="xl-field">
        <label className="xl-label">标题</label>
        <input className="xl-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如:公开演讲" />
      </div>
      <div className="xl-field">
        <label className="xl-label">图标(可以打字选 emoji,或用下面预设)</label>
        <EmojiPicker value={newIcon} onChange={setNewIcon} />
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
      <button className="xl-btn" onClick={saveSkill} disabled={saving} type="button" style={{ marginTop: 12 }}>
        {saving ? "保存中..." : "保存技能"}
      </button>
    </div>
  );
}
