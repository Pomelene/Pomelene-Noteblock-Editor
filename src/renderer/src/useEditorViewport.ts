import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Native nonpassive wheel handling is local to the editor's scroll surface. */
export function useEditorWheelZoom({
  scroller,
  zoom,
  min,
  max,
  gutter,
  setZoom,
  cancelGesture,
  onScroll,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  zoom: number;
  min: number;
  max: number;
  gutter: number;
  setZoom: (zoom: number) => void;
  cancelGesture: RefObject<(() => void) | null>;
  onScroll: (x: number, y: number) => void;
}) {
  const options = useRef({ zoom, min, max, gutter, setZoom, onScroll });
  options.current = { zoom, min, max, gutter, setZoom, onScroll };
  const pending = useRef<{ zoom: number; x: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !pending.current || pending.current.zoom !== zoom) return;
    el.scrollLeft = pending.current.x;
    pending.current = null;
    options.current.onScroll(el.scrollLeft, el.scrollTop);
  }, [zoom, scroller]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const o = options.current;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? el.clientHeight
            : 1);
      if (!Number.isFinite(delta) || delta === 0) return;
      const previous = pending.current?.zoom ?? o.zoom;
      const next = Math.max(
        o.min,
        Math.min(
          o.max,
          previous * Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.002),
        ),
      );
      if (next === previous) return;
      cancelGesture.current?.();
      const offset = Math.max(
        0,
        Math.min(
          el.clientWidth,
          event.clientX - el.getBoundingClientRect().left,
        ) - o.gutter,
      );
      const x = pending.current?.x ?? el.scrollLeft;
      pending.current = {
        zoom: next,
        x: Math.max(0, ((x + offset) / previous) * next - offset),
      };
      o.setZoom(next);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [scroller, cancelGesture]);
}

/** Keep the same row at the top when changing density, even near the bottom. */
export function useEditorRowHeight(
  scroller: RefObject<HTMLDivElement | null>,
  height: number,
  scrollY: number,
  onScroll: (x: number, y: number) => void,
) {
  const previous = useRef(height);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && previous.current !== height) {
      // The browser may already clamp scrollTop to the new smaller content.
      // Use the last rendered position, before the content size changed.
      el.scrollTop = (scrollY / previous.current) * height;
      onScroll(el.scrollLeft, el.scrollTop);
    }
    previous.current = height;
  }, [height, scroller, scrollY, onScroll]);
}
