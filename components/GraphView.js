"use client";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const CAT_COLOR = { input: "#92897A", permanent: "#5C8A72", output: "#E9C877" };

export default function GraphView({ notes, width = 480, height = 320 }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const draggingRef = useRef(null);
  const dataRef = useRef({ nodes: [], links: [] });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const tagSet = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => tagSet.add(t)));
    const nodeData = [
      ...notes.map((n) => ({
        id: `note-${n.id}`,
        type: "note",
        category: n.category,
        label: (n.title || n.text || "").slice(0, 10) + ((n.title || n.text || "").length > 10 ? "…" : ""),
      })),
      ...Array.from(tagSet).map((t) => ({ id: `tag-${t}`, type: "tag", label: t })),
    ];
    const linkData = [];
    notes.forEach((n) => (n.tags || []).forEach((t) => linkData.push({ source: `note-${n.id}`, target: `tag-${t}` })));

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
  }, [notes, width, height]);

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

  if (!notes.length) {
    return <div className="xl-entry__empty">还没有笔记,先去 Daily Insights 建一篇吧。</div>;
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
            <circle r={n.type === "tag" ? 5 : 8} fill={n.type === "tag" ? "#A23B3B" : CAT_COLOR[n.category]} stroke="#100D0B" strokeWidth={1.5} />
            <text
              x={0}
              y={n.type === "tag" ? -10 : 16}
              textAnchor="middle"
              fontSize={n.type === "tag" ? 9 : 8}
              fill="#EDE4D1"
              fontFamily="IBM Plex Mono, monospace"
              opacity={0.85}
            >
              {n.type === "tag" ? `#${n.label}` : n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="xl-graph-legend">
        <span><span className="xl-legend-dot" style={{ background: "#92897A" }}></span>Input</span>
        <span><span className="xl-legend-dot" style={{ background: "#5C8A72" }}></span>Permanent</span>
        <span><span className="xl-legend-dot" style={{ background: "#E9C877" }}></span>Output</span>
        <span><span className="xl-legend-dot" style={{ background: "#A23B3B" }}></span>标签 Tag</span>
      </div>
    </div>
  );
}
