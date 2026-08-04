"use client";

const PRESETS = ["✦", "📚", "💪", "🎨", "💰", "🎵", "🏃", "✍️", "📈", "🎯", "🧘", "💻", "🗣️", "🍳", "🎬"];

export default function EmojiPicker({ value, onChange }) {
  return (
    <div>
      <input
        className="xl-input"
        style={{ width: 80, textAlign: "center", fontSize: 18, marginBottom: 8 }}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 2))}
        placeholder="✦"
      />
      <div className="xl-pillrow">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`xl-pill xl-pill--sm ${value === p ? "xl-pill--active" : ""}`} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
