"use client";
import { useRef } from "react";
import { Minus, Square, X, Move } from "lucide-react";
import { useGraphWindow } from "@/context/GraphWindowContext";
import { useCollection } from "@/lib/useCollection";
import GraphView from "./GraphView";

const HEADER_H = 42;
const MIN_W = 320;
const MIN_H = 260;

export default function FloatingGraphWindow() {
  const { state, closeWindow, toggleMinimize, toggleMaximize, setPos, setSize } = useGraphWindow();
  const { data: notes } = useCollection("notes");
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  if (!state) return null;

  const onHeaderDown = (e) => {
    if (state.maximized) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: state.x, origY: state.y };
    window.addEventListener("mousemove", onHeaderMove);
    window.addEventListener("mouseup", onHeaderUp);
  };
  const onHeaderMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(Math.max(0, dragRef.current.origX + dx), Math.max(0, dragRef.current.origY + dy));
  };
  const onHeaderUp = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onHeaderMove);
    window.removeEventListener("mouseup", onHeaderUp);
  };

  const onResizeDown = (e) => {
    e.stopPropagation();
    if (state.maximized) return;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: state.w, origH: state.h };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeUp);
  };
  const onResizeMove = (e) => {
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    setSize(Math.max(MIN_W, resizeRef.current.origW + dx), Math.max(MIN_H, resizeRef.current.origH + dy));
  };
  const onResizeUp = () => {
    resizeRef.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeUp);
  };

  if (!state.open) return null;

  if (state.minimized) {
    return (
      <button className="xl-fwin__pill" style={{ left: state.x, top: state.y }} onClick={toggleMinimize} type="button">
        <Move size={12} /> 关系图
      </button>
    );
  }

  const style = state.maximized
    ? { left: 24, top: 24, right: 24, bottom: 24 }
    : { left: state.x, top: state.y, width: state.w, height: state.h };

  const graphW = state.maximized ? 860 : Math.max(MIN_W, state.w - 40);
  const graphH = state.maximized ? 640 : Math.max(200, state.h - HEADER_H - 90);

  return (
    <div className="xl-fwin" style={style}>
      <div className="xl-fwin__bar" onMouseDown={onHeaderDown}>
        <div className="xl-fwin__title"><Move size={12} /> 关系图 · Graph View</div>
        <div className="xl-fwin__controls">
          <button className="xl-fwin__btn" onClick={toggleMinimize} type="button" title="最小化"><Minus size={12} /></button>
          <button className="xl-fwin__btn" onClick={toggleMaximize} type="button" title={state.maximized ? "还原" : "最大化"}><Square size={11} /></button>
          <button className="xl-fwin__btn" onClick={closeWindow} type="button" title="关闭"><X size={12} /></button>
        </div>
      </div>
      <div className="xl-fwin__body">
        <GraphView notes={notes} width={graphW} height={graphH} />
      </div>
      {!state.maximized && (
        <div className="xl-fwin__resize" onMouseDown={onResizeDown}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M13 1L1 13M13 6L6 13M13 11L11 13" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </div>
      )}
    </div>
  );
}
