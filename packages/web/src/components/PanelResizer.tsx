// The side panel's width (specs/web-app): a handle on its left edge, dragged with the mouse or moved
// with the arrow keys; double-click puts it back. The width is remembered in this browser.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useT } from "../i18n.js";

export const PANEL_WIDTH_DEFAULT = 360;
export const PANEL_WIDTH_MIN = 300;
const KEY = "orbis.panelWidth";

/** The widest the panel may be: the conversation keeps at least 360 px beside the 300 px sidebar. */
export const panelMax = (viewport: number) => Math.max(PANEL_WIDTH_MIN, Math.min(1200, viewport - 300 - 360));
export const clampPanel = (width: number, viewport: number) => Math.round(Math.min(panelMax(viewport), Math.max(PANEL_WIDTH_MIN, width)));

function remembered(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

function remember(width: number): void {
  try {
    window.localStorage.setItem(KEY, String(width));
  } catch {
    /* a private window: the width lasts for this visit */
  }
}

/** The panel's width, kept within the window and remembered. */
export function usePanelWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => clampPanel(remembered(), window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth((w) => clampPanel(w, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const set = useCallback((next: number) => {
    const w = clampPanel(next, window.innerWidth);
    setWidth(w);
    remember(w);
  }, []);
  return [width, set];
}

export function PanelResizer({ width, onWidth }: { width: number; onWidth(width: number): void }) {
  const t = useT();
  const dragging = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add("resizing-panel");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onWidth(window.innerWidth - e.clientX);
  };
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove("resizing-panel");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === "ArrowLeft") onWidth(width + step);
    else if (e.key === "ArrowRight") onWidth(width - step);
    else if (e.key === "Home") onWidth(PANEL_WIDTH_MIN);
    else if (e.key === "End") onWidth(panelMax(window.innerWidth));
    else return;
    e.preventDefault();
  };
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("panel.resize")}
      title={t("panel.resize")}
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={panelMax(window.innerWidth)}
      tabIndex={0}
      style={{ right: `${width - 3}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidth(PANEL_WIDTH_DEFAULT)}
      data-testid="panel-resizer"
    />
  );
}
