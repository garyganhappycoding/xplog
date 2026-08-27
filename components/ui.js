"use client";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";

export const Pill = ({ active, onClick, children, small }) => (
  <button className={`xl-pill ${active ? "xl-pill--active" : ""} ${small ? "xl-pill--sm" : ""}`} onClick={onClick} type="button">
    {children}
  </button>
);

export const ProgressBar = ({ pct, tall }) => (
  <div className={`xl-bar ${tall ? "xl-bar--tall" : ""}`}>
    <div className="xl-bar__fill" style={{ width: `${pct}%` }} />
  </div>
);

export const LevelUpSeal = ({ skillName, level, onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="xl-seal-overlay" onClick={onDone}>
      <div className="xl-seal">
        <div className="xl-seal__ring">
          <Sparkles size={18} className="xl-seal__spark" />
          <div className="xl-seal__level">LV.{level}</div>
        </div>
        <div className="xl-seal__caption">{skillName} · 晋级</div>
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ open, title, message, confirmLabel = "确认删除", onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="xl-modal-overlay" onClick={onCancel}>
      <div className="xl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xl-modal__title">{title}</div>
        {message && <div className="xl-modal__msg">{message}</div>}
        <div className="xl-modal__actions">
          <button className="xl-btn--ghost" onClick={onCancel} type="button">取消</button>
          <button className="xl-btn xl-btn--danger" onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};