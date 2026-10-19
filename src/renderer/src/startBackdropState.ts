type Color = [number, number, number];
const presets = [
  {
    a: [0.16, 0.8, 0.95] as Color,
    b: [0.53, 0.25, 0.94] as Color,
    zoom: 0.95,
    warp: 0.45,
    n: 3.2,
    m: 5.1,
  },
  {
    a: [0.95, 0.48, 0.19] as Color,
    b: [0.88, 0.2, 0.57] as Color,
    zoom: 0.62,
    warp: 1.2,
    n: 2.4,
    m: 4.3,
  },
  {
    a: [0.2, 0.94, 0.71] as Color,
    b: [0.25, 0.5, 0.98] as Color,
    zoom: 1.22,
    warp: 0.78,
    n: 4.3,
    m: 3.2,
  },
];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function backdropState(time: number) {
  const cycle = Math.max(0, time) / 9,
    index = Math.floor(cycle) % presets.length,
    t = cycle - Math.floor(cycle),
    ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
  const from = presets[index],
    to = presets[(index + 1) % presets.length];
  const color = (a: Color, b: Color): Color => [
    lerp(a[0], b[0], ease),
    lerp(a[1], b[1], ease),
    lerp(a[2], b[2], ease),
  ];
  return {
    a: color(from.a, to.a),
    b: color(from.b, to.b),
    zoom: lerp(from.zoom, to.zoom, t) + 0.06 * Math.sin(time * 0.5),
    warp: lerp(from.warp, to.warp, ease) + 0.18 * Math.sin(time * 0.09),
    rotation: 0.55 * Math.sin(time * 0.22) + 0.1 * Math.sin(time * 0.47),
    n: lerp(from.n, to.n, t),
    m: lerp(from.m, to.m, t),
    time,
  };
}
export type BackdropState = ReturnType<typeof backdropState>;
