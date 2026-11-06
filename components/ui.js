"use client";
import { useEffect } from "react";
import { Check } from "lucide-react";

// Small shared pieces of the light, Google-style UI.

// A sheet that slides up from the bottom (create / edit / details).
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        {title && <h2 className="sheet__title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "删除", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="sheet__actions" style={{ marginTop: 0 }}>
          <button className="btn btn--text" onClick={onCancel} type="button">取消</button>
          <button className="btn btn--danger" onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// Round check box (Google Tasks style). `color` tints it with the task's board colour.
export function CheckBox({ checked, onChange, color }) {
  return (
    <button
      type="button"
      className={`check ${checked ? "check--done" : ""}`}
      style={color ? { borderColor: checked ? color : color, background: checked ? color : "transparent" } : undefined}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      aria-label={checked ? "标记为未完成" : "标记为完成"}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  );
}

export function Chip({ active, onClick, children, color, small, tint }) {
  const style = color && tint ? { background: `${color}1f`, color } : undefined;
  return (
    <button type="button" onClick={onClick} className={`chip ${active ? "chip--active" : ""} ${small ? "chip--sm" : ""} ${tint ? "chip--tint" : ""}`} style={style}>
      {color && !tint && <span className="dot" style={{ background: color }} />}
      {children}
    </button>
  );
}

export function TopBar({ title, sub, children }) {
  return (
    <header className="bar">
      <div className="bar__title">
        {title}
        {sub && <span className="bar__sub">{sub}</span>}
      </div>
      {children}
    </header>
  );
}
