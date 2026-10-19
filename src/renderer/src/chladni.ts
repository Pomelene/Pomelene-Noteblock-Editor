/** A procedural nodal-field visualization, not a physical plate/sand simulator. */
export function chladni(x: number, y: number, n = 3, m = 5) {
  const a = n * Math.PI,
    b = m * Math.PI;
  const ax = Math.sin(a * x),
    ay = Math.sin(a * y),
    bx = Math.sin(b * x),
    by = Math.sin(b * y);
  return {
    value: ax * by - bx * ay,
    dx: a * Math.cos(a * x) * by - b * Math.cos(b * x) * ay,
    dy: b * ax * Math.cos(b * y) - a * bx * Math.cos(a * y),
  };
}
export function createParticles(count: number, seed: number) {
  let state = seed | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
  const particles = new Float32Array(
    Math.max(0, Math.min(4000, Math.floor(count))) * 4,
  );
  for (let i = 0; i < particles.length; i += 4) {
    let x = 0,
      y = 0;
    for (let j = 0; j < 12; j++) {
      x = random() * 2 - 1;
      y = random() * 2 - 1;
      if (Math.abs(chladni(x, y).value) < 0.16) break;
    }
    particles[i] = x;
    particles[i + 1] = y;
  }
  return particles;
}
export function stepParticles(p: Float32Array, time: number, elapsed: number) {
  const dt = Math.max(0, Math.min(1 / 24, elapsed)),
    blend = 0.5 - 0.5 * Math.cos(time * 0.28),
    drag = Math.exp(-7 * dt);
  for (let i = 0; i < p.length; i += 4) {
    const x = p[i],
      y = p[i + 1],
      a = chladni(x, y),
      b = chladni(x, y, 4, 7);
    const f = a.value * (1 - blend) + b.value * blend,
      dx = a.dx * (1 - blend) + b.dx * blend,
      dy = a.dy * (1 - blend) + b.dy * blend;
    const force = (-f / (dx * dx + dy * dy + 0.2)) * 40;
    p[i + 2] = (p[i + 2] + force * dx * dt) * drag;
    p[i + 3] = (p[i + 3] + force * dy * dt) * drag;
    p[i] = Math.max(-1.02, Math.min(1.02, x + p[i + 2] * dt));
    p[i + 1] = Math.max(-1.02, Math.min(1.02, y + p[i + 3] * dt));
  }
}
