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
