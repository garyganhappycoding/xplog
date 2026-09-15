"use client";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const ENTRY_COLOR = "#5C8A72";
const SKILL_COLOR = "#A23B3B";

export default function GraphView({ entries, width = 480, height = 320 }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const draggingRef = useRef(null);
  const dataRef = useRef({ nodes: [], links: [] });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const tagged = entries.filter((e) => e.skillId);
    const skillSet = new Map();
    tagged.forEach((e) => { if (!skillSet.has(e.skillId)) skillSet.set(e.skillId, e.skill); });

    const nodeData = [
      ...tagged.map((e) => ({
        id: `entry-${e.id}`,
        type: "entry",
        label: (e.text || "").slice(0, 10) + ((e.text || "").length > 10 ? "…" : ""),
      })),
      ...Array.from(skillSet.entries()).map(([id, name]) => ({ id: `skill-${id}`, type: "skill", label: name })),
    ];
    const linkData = tagged.map((e) => ({ source: `entry-${e.id}`, target: `skill-${e.skillId}` }));

    const sim = d3
      .forceSimulation(nodeData)
      .force("link", d3.forceLink(linkData).id((d) => d.id).distance(58))
      .force("charge", d3.forceManyBody().strength(-140))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(26))
      .alphaDecay(0.02)
      .on("tick", () => forceTick((t) => t + 1));

    simRef.current = sim;
    dataRef.current = { nodes: nodeData, links: linkData };
    return () => sim.stop();
  }, [entries, width, height]);

  const toSvgPoint = (evt) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const handleDown = (node) => (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    draggingRef.current = node;
    node.fx = node.x;
    node.fy = node.y;
    if (simRef.current) simRef.current.alphaTarget(0.3).restart();
  };
  const handleMove = (evt) => {
    if (!draggingRef.current) return;
    const p = toSvgPoint(evt);
    draggingRef.current.fx = p.x;
    draggingRef.current.fy = p.y;
  };
  const handleUp = () => {
    if (draggingRef.current && simRef.current) simRef.current.alphaTarget(0);
    draggingRef.current = null;
  };

  const { nodes, links } = dataRef.current;

  if (!entries.filter((e) => e.skillId).length) {
    return <div className="xl-entry__empty">还没有已打标签的日记,先去「日记」写一篇吧。</div>;
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ background: "rgba(0,0,0,0.15)", borderRadius: 6, border: "1px solid var(--hairline)", touchAction: "none" }}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
      >
        {links.map((l, i) => (
          <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke="rgba(201,162,75,0.28)" strokeWidth={1} />
        ))}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x || 0},${n.y || 0})`} onMouseDown={handleDown(n)} style={{ cursor: "grab" }}>
            <circle r={n.type === "skill" ? 7 : 8} fill={n.type === "skill" ? SKILL_COLOR : ENTRY_COLOR} stroke="#100D0B" strokeWidth={1.5} />
            <text
              x={0}
              y={n.type === "skill" ? -12 : 16}
              textAnchor="middle"
              fontSize={n.type === "skill" ? 9 : 8}
              fill="#EDE4D1"
              fontFamily="IBM Plex Mono, monospace"
              opacity={0.85}
            >
              {n.type === "skill" ? `★ ${n.label}` : n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="xl-graph-legend">
        <span><span className="xl-legend-dot" style={{ background: ENTRY_COLOR }}></span>日记</span>
        <span><span className="xl-legend-dot" style={{ background: SKILL_COLOR }}></span>技能</span>
      </div>
    </div>
  );
}
