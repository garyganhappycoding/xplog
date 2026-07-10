"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function TagInput({ tags, setTags, allTags }) {
  const [val, setVal] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);

  const commit = (raw) => {
    const clean = raw.replace(/^[:：]/, "").trim();
    if (clean && !tags.includes(clean)) setTags([...tags, clean]);
    setVal("");
    setShowSuggest(false);
  };

  const query = val.replace(/^[:：]/, "").trim();
  const suggestions = query ? allTags.filter((t) => t.includes(query) && !tags.includes(t)).slice(0, 6) : [];
  const exactExists = allTags.includes(query);

  return (
    <div className="xl-tagwrap">
      {tags.map((t) => (
        <span className="xl-tagpill" key={t}>
          #{t}
          <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}><X size={10} /></button>
        </span>
      ))}
      <input
        className="xl-input--plain"
        style={{ flex: 1, minWidth: 140 }}
        value={val}
        onChange={(e) => { setVal(e.target.value); setShowSuggest(true); }}
        onFocus={() => setShowSuggest(true)}
        onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) { e.preventDefault(); commit(val); }
          if (e.key === "Backspace" && !val && tags.length) setTags(tags.slice(0, -1));
        }}
        placeholder={tags.length ? "继续用「：」新增标签" : "用「：」打标签,可以多个,例如 ：心理学"}
      />
      {showSuggest && query && (
        <div className="xl-tag-suggest">
          {suggestions.map((s) => (
            <div key={s} className="xl-tag-suggest__item" onMouseDown={() => commit(s)}>#{s}</div>
          ))}
          {!exactExists && (
            <div className="xl-tag-suggest__item xl-tag-suggest__item--new" onMouseDown={() => commit(query)}>
              + 新建标签「{query}」
            </div>
          )}
        </div>
      )}
    </div>
  );
}
