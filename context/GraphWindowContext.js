"use client";
import { createContext, useContext, useState } from "react";

const GraphWindowContext = createContext(null);

const DEFAULT_STATE = {
  open: false,
  minimized: false,
  maximized: false,
  x: 80,
  y: 80,
  w: 520,
  h: 420,
};

export function GraphWindowProvider({ children }) {
  const [state, setState] = useState(DEFAULT_STATE);

  const openWindow = () => setState((s) => ({ ...s, open: true, minimized: false }));
  const closeWindow = () => setState((s) => ({ ...s, open: false }));
  const toggleMinimize = () => setState((s) => ({ ...s, minimized: !s.minimized, maximized: false }));
  const toggleMaximize = () => setState((s) => ({ ...s, maximized: !s.maximized, minimized: false }));
  const setPos = (x, y) => setState((s) => ({ ...s, x, y }));
  const setSize = (w, h) => setState((s) => ({ ...s, w, h }));

  return (
    <GraphWindowContext.Provider value={{ state, openWindow, closeWindow, toggleMinimize, toggleMaximize, setPos, setSize }}>
      {children}
    </GraphWindowContext.Provider>
  );
}

export const useGraphWindow = () => useContext(GraphWindowContext);
