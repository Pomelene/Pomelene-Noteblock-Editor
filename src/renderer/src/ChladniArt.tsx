import { useEffect, useRef } from "react";
import { createParticles, stepParticles } from "./chladni";
import { createStartBackdrop } from "./startBackdrop";

export function ChladniArt({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLCanvasElement>(null),
    containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused),
    syncRef = useRef<(() => void) | null>(null);
  pausedRef.current = paused;
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d"),
      container = containerRef.current,
      background = backgroundRef.current;
    if (!canvas || !ctx || !container || !background) return;
    const backdrop = createStartBackdrop(background);
    container.dataset.renderer = backdrop.mode;
    const particles = createParticles(2300, 20261019);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = matchMedia("(forced-colors: active)");
    let frame = 0,
      last = 0,
      time = 0,
      w = 0,
      h = 0,
      disposed = false;
    let hostActive = true,
      activityRevision = 0;
    const colors = [
      "rgba(181,235,255,.34)",
      "rgba(215,200,255,.27)",
      "rgba(236,248,255,.43)",
    ];
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      backdrop.draw(time);
      const angle = 0.14 + Math.sin(time * 0.09) * 0.08,
        cs = Math.cos(angle),
        sn = Math.sin(angle);
      ctx.globalCompositeOperation = "lighter";
      for (let group = 0; group < 3; group++) {
        ctx.beginPath();
        for (let i = group * 4; i < particles.length; i += 12) {
          const x = particles[i],
            y = particles[i + 1],
            px =
              (0.5 + (x * cs - y * sn) * 0.53) * w +
              Math.sin(y * 2 + time * 0.15) * w * 0.03,
            py = (0.5 + (x * sn + y * cs) * 0.53) * h;
          const r = group === 2 ? 1.05 : 0.7;
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
        ctx.fillStyle = colors[group];
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      container.dataset.frames = String(+(container.dataset.frames ?? 0) + 1);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      container.dataset.animating = "false";
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
        !forcedColors.matches &&
        !document.hidden &&
        document.hasFocus() &&
        hostActive
      ) {
        container.dataset.animating = "true";
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
      const r = container.getBoundingClientRect();
      w = r.width;
      h = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop.resize(w, h);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    reduced.addEventListener("change", sync);
    forcedColors.addEventListener("change", sync);
    return () => {
      disposed = true;
      stop();
      syncRef.current = null;
      offActivity();
      backdrop.dispose();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
      reduced.removeEventListener("change", sync);
      forcedColors.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => syncRef.current?.(), [paused]);
  return (
    <div ref={containerRef} className="start-art" aria-hidden="true">
      <canvas ref={backgroundRef} className="start-backdrop" />
      <canvas ref={ref} className="start-particles" />
    </div>
  );
}
