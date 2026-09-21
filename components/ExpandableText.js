"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function ExpandableText({ text, lines = 3, className = "xl-entry__text" }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    measure();
    // Re-measure once web fonts finish loading (fallback-font metrics can
    // mis-detect overflow by a line) and once more after layout has fully
    // settled (a raf pair, since the very first effect run can fire before
    // the browser has committed final layout/paint).
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return (
    <div>
      <div
        ref={ref}
        className={className}
        style={{
          whiteSpace: "pre-wrap",
          ...(expanded
            ? {}
            : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}
      >
        {text}
      </div>
      {(overflows || expanded) && (
        <button type="button" className="xl-showmore-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <>收起 <ChevronUp size={11} /></> : <>展开全部 <ChevronDown size={11} /></>}
        </button>
      )}
    </div>
  );
}
