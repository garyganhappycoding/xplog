"use client";
import { useMemo, useState } from "react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Image as ImageIcon, Pencil, X as XIcon, Check, Tag as TagIcon } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { useAuth } from "@/context/AuthContext";
import { storage } from "@/lib/firebase";
import { ConfirmDialog } from "@/components/ui";
import ExpandableText from "@/components/ExpandableText";
import TagInput from "@/components/TagInput";

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
  const { data: entries, add: addEntry, update: updateEntry, remove: removeEntry } = useCollection("diaryEntries", "createdAt");

  const [text, setText] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [composeTags, setComposeTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set();
    entries.forEach((e) => (e.tags || []).forEach((t) => s.add(t)));
    return Array.from(s);
  }, [entries]);

  const [editingTagId, setEditingTagId] = useState(null);
  const [editSkillName, setEditSkillName] = useState("");
  const [editXp, setEditXp] = useState(1);
  const [savingTag, setSavingTag] = useState(false);

  const [editingTextId, setEditingTextId] = useState(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [savingText, setSavingText] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [editingTopicTagsId, setEditingTopicTagsId] = useState(null);
  const [editTopicTags, setEditTopicTags] = useState([]);
  const [savingTopicTags, setSavingTopicTags] = useState(false);

  const [filterTag, setFilterTag] = useState(null);
  const visibleEntries = filterTag ? entries.filter((e) => (e.tags || []).includes(filterTag)) : entries;

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
      tags: composeTags,
      createdAt: Date.now(),
      skill: null,
      skillId: null,
      xpDelta: 0,
      aiTagged: false,
      confidence: 0,
    });

    setText("");
    setPhotoFile(null);
    setComposeTags([]);
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

  const startEditTag = (e) => {
    setEditingTagId(e.id);
    setEditSkillName(e.skill || "");
    setEditXp(e.xpDelta || 1);
  };

  const saveEditTag = async (entry) => {
    if (!editSkillName.trim()) return;
    setSavingTag(true);
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
    setSavingTag(false);
    setEditingTagId(null);
  };

  const startEditText = (e) => {
    setEditingTextId(e.id);
    setEditTextValue(e.text);
  };

  const saveEditText = async (entry) => {
    if (!editTextValue.trim()) return;
    setSavingText(true);
    await updateEntry(entry.id, { text: editTextValue.trim() });
    setSavingText(false);
    setEditingTextId(null);
  };

  const startEditTopicTags = (e) => {
    setEditingTopicTagsId(e.id);
    setEditTopicTags(e.tags || []);
  };

  const saveTopicTags = async (entry) => {
    setSavingTopicTags(true);
    await updateEntry(entry.id, { tags: editTopicTags });
    setSavingTopicTags(false);
    setEditingTopicTagsId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    if (deleteTarget.skillId) {
      const skill = skills.find((s) => s.id === deleteTarget.skillId);
      if (skill) await updateSkill(skill.id, { totalXp: Math.max(0, (skill.totalXp || 0) - (deleteTarget.xpDelta || 0)) });
    }
    await removeEntry(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这篇日记?"
        message={deleteTarget?.skillId ? `删除后无法恢复,对应技能「${deleteTarget.skill}」的 ${deleteTarget.xpDelta} XP 也会被扣除。` : "删除后无法恢复。"}
        confirmLabel={deleting ? "删除中..." : "确认删除"}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="xl-header"><div className="xl-title">日记</div></div>

      <textarea
        className="xl-diary-compose"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="今天做了什么?写下来,AI 会自动判断属于哪个技能、值多少 XP。"
        autoFocus
      />
      <TagInput tags={composeTags} setTags={setComposeTags} allTags={allTags} />
      <div className="xl-divider" />
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

      {filterTag && (
        <div className="xl-subtitle" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          筛选标签: <span className="xl-topictag">#{filterTag}</span>
          <button className="xl-entry__iconbtn" onClick={() => setFilterTag(null)} type="button" title="清除筛选"><XIcon size={12} /></button>
        </div>
      )}

      {visibleEntries.map((e) => (
        <div className="xl-entry" key={e.id}>
          {e.photoUrl && <img src={e.photoUrl} alt="" style={{ maxWidth: "100%", borderRadius: 4, marginBottom: 10 }} />}

          {editingTextId === e.id ? (
            <div style={{ marginBottom: 10 }}>
              <textarea
                className="xl-input"
                value={editTextValue}
                onChange={(ev) => setEditTextValue(ev.target.value)}
                style={{ minHeight: 100, marginBottom: 8 }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveEditText(e)} disabled={savingText} type="button">
                  <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{savingText ? "保存中..." : "保存"}
                </button>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingTextId(null)} type="button">
                  <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}><ExpandableText text={e.text} /></div>
              <div className="xl-entry__actions" style={{ flexShrink: 0 }}>
                <button className="xl-entry__iconbtn" onClick={() => startEditText(e)} type="button" title="编辑"><Pencil size={12} /></button>
                <button className="xl-entry__iconbtn xl-entry__iconbtn--danger" onClick={() => setDeleteTarget(e)} type="button" title="删除"><XIcon size={12} /></button>
              </div>
            </div>
          )}

          {editingTopicTagsId === e.id ? (
            <div style={{ marginBottom: 10 }}>
              <TagInput tags={editTopicTags} setTags={setEditTopicTags} allTags={allTags} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveTopicTags(e)} disabled={savingTopicTags} type="button">
                  <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{savingTopicTags ? "保存中..." : "保存"}
                </button>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingTopicTagsId(null)} type="button">
                  <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 10 }}>
              {(e.tags || []).map((t) => (
                <span className="xl-topictag" style={{ cursor: "pointer" }} key={t} onClick={() => setFilterTag(t)}>#{t}</span>
              ))}
              <button className="xl-entry__iconbtn" onClick={() => startEditTopicTags(e)} type="button" title="编辑标签">
                <TagIcon size={11} />
              </button>
            </div>
          )}

          {editingTagId === e.id ? (
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
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => saveEditTag(e)} disabled={savingTag} type="button">
                  <Check size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{savingTag ? "保存中..." : "保存"}
                </button>
                <button className="xl-btn--ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingTagId(null)} type="button">
                  <XIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />取消
                </button>
              </div>
            </div>
          ) : e.skillId ? (
            <span className="xl-tagpill" style={{ cursor: "pointer" }} onClick={() => startEditTag(e)}>
              {e.skill} +{e.xpDelta} XP <Pencil size={9} />
            </span>
          ) : (
            <span className="xl-tagpill" style={{ opacity: 0.6 }}>打标签中...</span>
          )}
        </div>
      ))}
      {visibleEntries.length === 0 && (
        <div className="xl-entry__empty">{filterTag ? "没有带这个标签的日记。" : "还没有日记,写下第一篇吧。"}</div>
      )}
    </>
  );
}
