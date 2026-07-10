"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useCollection } from "@/lib/useCollection";
import { Pill } from "@/components/ui";

export default function MeritPage() {
  const { data: merits, add } = useCollection("merits", "createdAt");
  const [showAdd, setShowAdd] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState("merit");

  const submit = async () => {
    if (!text.trim()) return;
    await add({ text: text.trim(), type, createdAt: Date.now() });
    setText("");
    setShowAdd(false);
  };

  return (
    <div style={{ position: "relative", minHeight: 400 }}>
      <div className="xl-header"><div className="xl-title">功过格</div></div>
      <div className="xl-subtitle" style={{ marginBottom: 20 }}>独立记录,不影响技能 XP</div>

      {showAdd && (
        <div className="xl-panel">
          <div className="xl-field">
            <label className="xl-label">类型</label>
            <div className="xl-pillrow">
              <Pill small active={type === "merit"} onClick={() => setType("merit")}>功</Pill>
              <Pill small active={type === "demerit"} onClick={() => setType("demerit")}>过</Pill>
            </div>
          </div>
          <div className="xl-field">
            <textarea className="xl-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="今天做了什么值得记下的事?" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="xl-btn" onClick={submit} type="button">保存</button>
            <button className="xl-btn--ghost" onClick={() => setShowAdd(false)} type="button">取消</button>
          </div>
        </div>
      )}

      {merits.map((m) => (
        <div className="xl-mrow" key={m.id}>
          <div className={`xl-mdot ${m.type === "merit" ? "xl-mdot--merit" : "xl-mdot--demerit"}`} />
          <div>
            <div style={{ fontSize: 13 }}>{m.text}</div>
            <div className="xl-mdate">{m.type === "merit" ? "功" : "过"}</div>
          </div>
        </div>
      ))}

      {!showAdd && <button className="xl-fab" onClick={() => setShowAdd(true)} type="button"><Plus size={22} /></button>}
    </div>
  );
}
