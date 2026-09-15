"use client";
import { useState } from "react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Image as ImageIcon, Pencil, X as XIcon, Check } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { useAuth } from "@/context/AuthContext";
import { storage } from "@/lib/firebase";

const clampXp = (n) => Math.min(10, Math.max(1, Math.round(Number(n) || 1)));

async function resolveSkill(name, skills, addSkill) {
  const clean = name.trim();
  const existing = skills.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) return { id: existing.id, name: existing.name, totalXp: existing.totalXp || 0 };
  const ref = await addSkill({ name: clean, nameEn: clean, icon: "✦", totalXp: 0, hasValue: false, milestones: [] });
  return { id: ref.id, name: clean, totalXp: 0 };
}

export default function DiaryPage() {
  const { user } = useAuth();
  const { data: skills, add: addSkill, update: updateSkill } = useCollection("skills");
  const { data: entries, add: addEntry, update: updateEntry } = useCollection("diaryEntries", "createdAt");

  const [text, setText] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editSkillName, setEditSkillName] = useState("");
  const [editXp, setEditXp] = useState(1);
  const [savingEdit, setSavingEdit] = useState(false);

  const submit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);

    let photoUrl = null;
    if (photoFile && user) {
      const path = `users/${user.uid}/diary-photos/${Date.now()}-${photoFile.name}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, photoFile);
      photoUrl = await getDownloadURL(fileRef);
    }

    const entryRef = await addEntry({
      text: text.trim(),
      photoUrl,
      createdAt: Date.now(),
      skill: null,
      skillId: null,
      xpDelta: 0,
      aiTagged: false,
      confidence: 0,
    });

    setText("");
    setPhotoFile(null);
    setSubmitting(false);

    try {
      const res = await fetch("/api/tag-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), existingSkills: skills.map((s) => s.name) }),
      });
      const tag = await res.json();
      const resolved = await resolveSkill(tag.skill || "Uncategorized", skills, addSkill);
      await updateSkill(resolved.id, { totalXp: resolved.totalXp + (tag.xpDelta || 1) });
      await updateEntry(entryRef.id, {
        skill: resolved.name,
        skillId: resolved.id,
        xpDelta: tag.xpDelta || 1,
        aiTagged: true,
        confidence: tag.confidence || 0,
      });
    } catch {
      const resolved = await resolveSkill("Uncategorized", skills, addSkill);
      await updateSkill(resolved.id, { totalXp: resolved.totalXp + 1 });
      await updateEntry(entryRef.id, { skill: resolved.name, skillId: resolved.id, xpDelta: 1, aiTagged: true, confidence: 0 });
    }
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setEditSkillName(e.skill || "");
    setEditXp(e.xpDelta || 1);
  };

  const saveEdit = async (entry) => {
    if (!editSkillName.trim()) return;
    setSavingEdit(true);
    const newXp = clampXp(editXp);
    const resolved = await resolveSkill(editSkillName, skills, addSkill);

    if (entry.skillId && entry.skillId === resolved.id) {
      const base = resolved.totalXp - (entry.xpDelta || 0) + newXp;
      await updateSkill(resolved.id, { totalXp: Math.max(0, base) });
    } else {
      if (entry.skillId) {
        const oldSkill = skills.find((s) => s.id === entry.skillId);
        if (oldSkill) await updateSkill(oldSkill.id, { totalXp: Math.max(0, (oldSkill.totalXp || 0) - (entry.xpDelta || 0)) });
      }
      await updateSkill(resolved.id, { totalXp: resolved.totalXp + newXp });
    }

    await updateEntry(entry.id, { skill: resolved.name, skillId: resolved.id, xpDelta: newXp, aiTagged: false });
    setSavingEdit(false);
    setEditingId(null);
  };

  return (
    <>
      <div className="xl-header"><div className="xl-title">日记</div></div>

      <div className="xl-field">
        <textarea
          className="xl-input"
          style={{ minHeight: 100 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天做了什么?写下来,AI 会自动判断属于哪个技能、值多少 XP。"
        />
      </div>
      <div className="xl-field" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label className="xl-btn--ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ImageIcon size={14} />
          {photoFile ? photoFile.name : "添加照片(可选)"}
          <input type="file" accept="image/*" hidden onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
        </label>
        <button className="xl-btn" onClick={submit} disabled={!text.trim() || submitting} type="button">
          {submitting ? "保存中..." : "保存日记"}
        </button>
      </div>

      {entries.map((e) => (
        <div className="xl-entry" key={e.id}>
          {e.photoUrl && <img src={e.photoUrl} alt="" style={{ maxWidth: "100%", borderRadius: 4, marginBottom: 10 }} />}
          <div className="xl-entry__text" style={{ marginBottom: 10 }}>{e.text}</div>

          {editingId === e.id ? (
            <div className="xl-panel" style={{ margin: 0 }}>
              <div className="xl-field">
                <label className="xl-label">技能(可从已有技能里选,或直接输入新名字)</label>
                <input
                  className="xl-input"
                  list="xl-skill-options"
                  value={editSkillName}
                  onChange={(ev) => setEditSkillName(ev.target.value)}
                  placeholder="技能名称"
                />
                <datalist id="xl-skill-options">
                  {skills.map((s) => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div className="xl-field">
                <label className="xl-label">XP(1-10)</label>
                <input
                  className="xl-input"
                  type="number"
                  min={1}
                  max={10}
                  value={editXp}
                  onChange={(ev) => setEditXp(ev.target.value)}
                  style={{ width: 100 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveEdit(e)} disabled={savingEdit} type="button">
                  <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{savingEdit ? "保存中..." : "保存"}
                </button>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingId(null)} type="button">
                  <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
                </button>
              </div>
            </div>
          ) : e.skillId ? (
            <span className="xl-tagpill" style={{ cursor: "pointer" }} onClick={() => startEdit(e)}>
              {e.skill} +{e.xpDelta} XP <Pencil size={9} />
            </span>
          ) : (
            <span className="xl-tagpill" style={{ opacity: 0.6 }}>打标签中...</span>
          )}
        </div>
      ))}
      {entries.length === 0 && <div className="xl-entry__empty">还没有日记,写下第一篇吧。</div>}
    </>
  );
}
