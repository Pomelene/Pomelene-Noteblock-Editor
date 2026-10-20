import { useEffect, useRef } from "react";

/** Transparent overlay: transport updates never invalidate the musical canvas. */
export function PlaybackCursor({ tick, zoom, scrollX, width, height, gutter, playlist = false }: {
  tick: number; zoom: number; scrollX: number; width: number; height: number;
  gutter: number; playlist?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = devicePixelRatio || 1;
    el.width = Math.round(width * ratio);
    el.height = Math.round(height * ratio);
    ctx.scale(ratio, ratio);
    const x = gutter + tick * zoom - scrollX;
    if (x < gutter || x > width || (!playlist && x === width)) return;
    ctx.fillStyle = playlist ? "#ecc17d" : "#e7b66e";
    ctx.fillRect(x, 0, playlist ? 1.5 : 1, height);
    if (playlist) {
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x, 7);
      ctx.fill();
    }
  }, [tick, zoom, scrollX, width, height, gutter, playlist]);
  return <div aria-hidden="true" style={{ position: "sticky", left: 0, top: 0,
    width, height: 0, zIndex: 1, pointerEvents: "none" }}>
    <canvas ref={canvas} data-testid="playback-cursor" style={{ position: "absolute",
      left: 0, top: 0, width, height, pointerEvents: "none" }} />
  </div>;
}
