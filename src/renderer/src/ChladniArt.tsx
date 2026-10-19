import { useEffect, useRef } from "react";
import { createParticles, stepParticles } from "./chladni";

export function ChladniArt({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused),
    syncRef = useRef<(() => void) | null>(null);
  pausedRef.current = paused;
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const particles = createParticles(2300, 20261019);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last = 0,
      time = 0,
      w = 0,
      h = 0,
      disposed = false;
    let hostActive = true,
      activityRevision = 0;
    const colors = [
      "rgba(157,227,255,.78)",
      "rgba(196,182,255,.65)",
      "rgba(236,248,255,.85)",
    ];
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w * 0.29, h * 0.42),
        cx = w < 760 ? w * 0.54 : w * 0.72,
        cy = h * 0.5;
      const angle = 0.14 + Math.sin(time * 0.09) * 0.08,
        cs = Math.cos(angle),
        sn = Math.sin(angle);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.3);
      glow.addColorStop(0, "rgba(90,134,205,.09)");
      glow.addColorStop(1, "rgba(90,134,205,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let group = 0; group < 3; group++) {
        ctx.beginPath();
        for (let i = group * 4; i < particles.length; i += 12) {
          const x = particles[i],
            y = particles[i + 1],
            px = cx + (x * cs - y * sn) * scale,
            py = cy + (x * sn + y * cs) * scale;
          const r = group === 2 ? 1.05 : 0.7;
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = colors[group];
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      canvas.dataset.frames = String(+(canvas.dataset.frames ?? 0) + 1);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      canvas.dataset.animating = "false";
    };
    const tick = (now: number) => {
      if (disposed) return;
      if (!last || now - last >= 1000 / 30) {
        const dt = last ? Math.min((now - last) / 1000, 1 / 24) : 1 / 30;
        last = now;
        time += dt;
        stepParticles(particles, time, dt);
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      if (disposed) return;
      draw();
      if (
        !pausedRef.current &&
        !reduced.matches &&
        !document.hidden &&
        document.hasFocus() &&
        hostActive
      ) {
        canvas.dataset.animating = "true";
        frame = requestAnimationFrame(tick);
      }
    };
    syncRef.current = sync;
    const offActivity = window.studio.onWindowActivity((active) => {
      activityRevision++;
      hostActive = active;
      sync();
    });
    void window.studio
      .getWindowActivity()
      .then((active) => {
        if (!disposed && activityRevision === 0) {
          hostActive = active;
          sync();
        }
      })
      .catch(() => {});
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    reduced.addEventListener("change", sync);
    return () => {
      disposed = true;
      stop();
      syncRef.current = null;
      offActivity();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => syncRef.current?.(), [paused]);
  return <canvas ref={ref} className="start-art" aria-hidden="true" />;
}
