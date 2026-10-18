// Read-only structural diagnostics; deliberately separate from the production decoder.
const fs = require("node:fs"),
  path = require("node:path");
function inspect(file) {
  const d = fs.readFileSync(file);
  let p = 0;
  const b = () => d.readUInt8(p++),
    s = () => {
      const x = d.readUInt16LE(p);
      p += 2;
      return x;
    },
    i = () => {
      const x = d.readInt32LE(p);
      p += 4;
      return x;
    },
    str = () => {
      const n = i();
      if (n < 0 || n > 1048576) throw Error("string " + n + " at " + p);
      const x = d.subarray(p, p + n).toString("utf8");
      p += n;
      return x;
    };
  const first = s(),
    v = first === 0 ? b() : 0,
    vanilla = v ? b() : 10,
    len = v >= 3 ? s() : first,
    height = s();
  const title = str();
  str();
  str();
  str();
  const tempo = s();
  b();
  b();
  const signature = b();
  for (let j = 0; j < 5; j++) i();
  str();
  if (v >= 4) {
    b();
    b();
    s();
  }
  let notes = 0,
    maxLayer = -1,
    maxInstrument = 0,
    velocity = {},
    tick = -1;
  for (;;) {
    const jump = s();
    if (!jump) break;
    tick += jump;
    let layer = -1;
    for (;;) {
      const delta = s();
      if (!delta) break;
      layer += delta;
      maxLayer = Math.max(maxLayer, layer);
      maxInstrument = Math.max(maxInstrument, b());
      b();
      if (v >= 4) {
        const vel = b();
        if (vel > 100) velocity[vel] = (velocity[vel] || 0) + 1;
        b();
        s();
      }
      notes++;
    }
  }
  const noteEnd = p;
  const layers = [];
  try {
    for (let j = 0; j < height && p < d.length; j++) {
      const name = str();
      const lock = v >= 4 ? b() : 0,
        volume = b(),
        pan = v >= 2 ? b() : 100;
      layers.push({ name, lock, volume, pan });
    }
    const c = p < d.length ? b() : 0;
    for (let j = 0; j < c; j++) {
      str();
      str();
      b();
      b();
    }
    const tail = d.subarray(p);
    console.log(
      JSON.stringify({
        file: path.basename(file),
        v,
        vanilla,
        height,
        maxLayer,
        notes,
        maxInstrument,
        velocity,
        noteEnd,
        layerEnd: p,
        custom: c,
        tail: tail.length,
        nonzero: tail.reduce((n, x) => n + (x !== 0), 0),
        head: [...tail.subarray(0, 24)],
        lastLayer: layers.at(-1),
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        file: path.basename(file),
        v,
        height,
        maxLayer,
        notes,
        maxInstrument,
        velocity,
        noteEnd,
        p,
        error: String(e),
      }),
    );
  }
}
function walk(folder) {
  for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
    const f = path.join(folder, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith(".nbs")) inspect(f);
  }
}
walk(process.argv[2]);
