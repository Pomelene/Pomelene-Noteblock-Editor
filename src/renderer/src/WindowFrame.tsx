import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Copy, ExternalLink, Minus, Square, X } from "lucide-react";
import {
  fitWindow,
  moveWindow,
  resizeWindow,
  type ResizeEdge,
  type WindowRect,
  type WorkspaceBounds,
} from "./windowGeometry";
import "./window.css";

export interface EditorView {
  id: string;
  kind: "pattern" | "phrase" | "sample";
  sourceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  state: "normal" | "maximized" | "minimized";
  z: number;
}

export interface FrameView extends Omit<EditorView, "kind"> {
  kind: EditorView["kind"] | "playlist";
}

interface WindowFrameProps {
  view: FrameView;
  className?: string;
  title: string;
  active: boolean;
  onChange: (change: Partial<FrameView>) => void;
  onFocus: () => void;
  onClose: () => void;
  onPopout: () => void;
  children: ReactNode;
}

interface PointerSession {
  id: number;
  x: number;
  y: number;
  rect: WindowRect;
  bounds: WorkspaceBounds;
  edge?: ResizeEdge;
}

const edges: ResizeEdge[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

export function WindowFrame({
  view,
  className = "studio-window",
  title,
  active,
  onChange,
  onFocus,
  onClose,
  onPopout,
  children,
}: WindowFrameProps) {
  const frame = useRef<HTMLElement>(null);
  const pointer = useRef<PointerSession | null>(null);
  const [bounds, setBounds] = useState<WorkspaceBounds | null>(null);

  useLayoutEffect(() => {
    const parent = frame.current?.parentElement;
    if (!parent) return;
    const measure = () =>
      setBounds({ width: parent.clientWidth, height: parent.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const focusEditor = () => {
    const editor = frame.current
      ?.querySelector(".window-content")
      ?.querySelector<HTMLElement>(
        ".playlist, .pattern-editor, .phrase-preview, .sample-editor",
      );
    (editor ?? frame.current)?.focus({ preventScroll: true });
  };

  const toggleMaximize = () => {
    onFocus();
    focusEditor();
    onChange({ state: view.state === "maximized" ? "normal" : "maximized" });
  };

  const begin = (event: PointerEvent<HTMLElement>, edge?: ResizeEdge) => {
    if (event.button !== 0) return;
    if (!edge && (event.target as Element).closest("button")) return;
    focusEditor();
    if (view.state !== "normal") return;
    const element = frame.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = element.getBoundingClientRect();
    const workspace = parent.getBoundingClientRect();
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      edge,
      rect: {
        x: rect.left - workspace.left - parent.clientLeft + parent.scrollLeft,
        y: rect.top - workspace.top - parent.clientTop + parent.scrollTop,
        w: rect.width,
        h: rect.height,
      },
      bounds: { width: parent.clientWidth, height: parent.clientHeight },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const session = pointer.current;
    if (!session || session.id !== event.pointerId) return;
    const dx = event.clientX - session.x;
    const dy = event.clientY - session.y;
    const next = session.edge
      ? resizeWindow(session.rect, session.edge, dx, dy, session.bounds)
      : moveWindow(session.rect, dx, dy, session.bounds);
    onChange(next);
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const rect =
    view.state === "maximized" && bounds
      ? { x: 0, y: 0, w: bounds.width, h: bounds.height }
      : bounds
        ? fitWindow(view, bounds)
        : view;

  return (
    <section
      ref={frame}
      className={`workspace-frame ${className}${active ? " active" : ""}${view.state === "maximized" ? " maximized" : ""}`}
      tabIndex={-1}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: view.z,
        display: view.state === "minimized" ? "none" : undefined,
      }}
      aria-label={title}
      data-testid={`editor-window-${view.id}`}
      data-view-id={view.id}
      data-source-id={view.sourceId}
      data-kind={view.kind}
      data-state={view.state}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      <header
        className="studio-window-titlebar"
        onClick={(event) => {
          if (!(event.target as Element).closest("button")) focusEditor();
        }}
        onPointerDown={(event) => begin(event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
        onDoubleClick={(event) => {
          if (!(event.target as Element).closest("button")) toggleMaximize();
        }}
      >
        <span className="studio-window-title">{title}</span>
        <div className="studio-window-actions">
          <button
            type="button"
            aria-label="弹出桌面窗口"
            title="弹出桌面窗口"
            onClick={onPopout}
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            aria-label="最小化窗口"
            title="最小化窗口"
            onClick={() => onChange({ state: "minimized" })}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label="最大化或还原"
            title={view.state === "maximized" ? "还原" : "最大化"}
            onClick={toggleMaximize}
          >
            {view.state === "maximized" ? (
              <Copy size={12} />
            ) : (
              <Square size={12} />
            )}
          </button>
          <button
            type="button"
            className="studio-window-close"
            aria-label="关闭窗口"
            title="关闭窗口"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>
      <div className="window-content">{children}</div>
      {view.state === "normal" &&
        edges.map((edge) => (
          <div
            key={edge}
            className={`studio-window-resize studio-window-resize-${edge}`}
            data-resize-edge={edge}
            aria-hidden="true"
            onPointerDown={(event) => begin(event, edge)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={() => {
              pointer.current = null;
            }}
          />
        ))}
    </section>
  );
}

export default WindowFrame;
