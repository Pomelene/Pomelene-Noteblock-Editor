/* Standalone experiment: no imports from the production editor. */
(() => {
  const qualities = {
    major: { label: "大三和弦", suffix: "", intervals: [0, 4, 7] },
    minor: { label: "小三和弦", suffix: "m", intervals: [0, 3, 7] },
    dom7: { label: "属七和弦", suffix: "7", intervals: [0, 4, 7, 10] },
    maj7: { label: "大七和弦", suffix: "maj7", intervals: [0, 4, 7, 11] },
    min7: { label: "小七和弦", suffix: "m7", intervals: [0, 3, 7, 10] },
    sus2: { label: "挂二和弦", suffix: "sus2", intervals: [0, 2, 7] },
    sus4: { label: "挂四和弦", suffix: "sus4", intervals: [0, 5, 7] },
    dim: { label: "减三和弦", suffix: "dim", intervals: [0, 3, 6] },
    aug: { label: "增三和弦", suffix: "aug", intervals: [0, 4, 8] },
  };
  const names = [
    "C",
    "C♯",
    "D",
    "E♭",
    "E",
    "F",
    "F♯",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ];
  const pc = (pitch) => ((pitch % 12) + 12) % 12;
  const noteName = (pitch) =>
    `${names[pc(pitch)]}${Math.floor(pitch / 12) - 1}`;
  function voice({
    root,
    quality = "major",
    inversion = 0,
    spread = false,
    extension = "none",
    bass = null,
  }) {
    if (!Number.isInteger(root) || !qualities[quality])
      throw Error("根音或和弦类型无效");
    const intervals = [...qualities[quality].intervals];
    const added = { none: null, 6: 9, 9: 14, 11: 17, 13: 21 }[extension];
    if (added === undefined) throw Error("附加音无效");
    if (added !== null && !intervals.includes(added)) intervals.push(added);
    let pitches = [...new Set(intervals)]
      .sort((a, b) => a - b)
      .map((n) => root + n);
    if (!Number.isInteger(inversion) || inversion < 0 || inversion > 3)
      throw Error("转位无效");
    for (let i = 0; i < inversion; i++) pitches.push(pitches.shift() + 12);
    pitches.sort((a, b) => a - b);
    if (spread && pitches.length > 2) {
      pitches[1] += 12;
      pitches.sort((a, b) => a - b);
    }
    if (bass !== null) {
      const bassPc = bass === "root" ? pc(root) : bass;
      if (!Number.isInteger(bassPc) || bassPc < 0 || bassPc > 11)
        throw Error("低音无效");
      let pitch = pitches[0] - 1;
      while (pc(pitch) !== bassPc) pitch--;
      pitches.unshift(pitch);
    }
    pitches = [...new Set(pitches)].sort((a, b) => a - b);
    if (pitches.some((n) => n < 21 || n > 108))
      throw Error("超出 NBS 音高 21–108，请降低八度、转位或附加音");
    return pitches;
  }
  function palette(tonic = 0, scale = "major", octave = 4) {
    const major = scale === "major";
    const steps = major ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const types = major
      ? ["major", "minor", "minor", "major", "major", "minor", "dim"]
      : ["minor", "dim", "major", "minor", "minor", "major", "major"];
    const romans = major
      ? ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
      : ["i", "ii°", "III", "iv", "v", "VI", "VII"];
    return steps.map((step, i) => ({
      root: 12 * (octave + 1) + tonic + step,
      quality: types[i],
      degree: romans[i],
    }));
  }
  function symbol(chord) {
    const pitches = voice(chord);
    const suffix = qualities[chord.quality || "major"].suffix;
    const extension =
      chord.extension && chord.extension !== "none"
        ? `(add${chord.extension})`
        : "";
    return `${names[pc(chord.root)]}${suffix}${extension}${pc(pitches[0]) !== pc(chord.root) ? "/" + names[pc(pitches[0])] : ""}`;
  }
  function generate(
    chord,
    { tick = 0, mode = "block", velocity = 80, instrument = "harp" } = {},
  ) {
    if (!Number.isInteger(tick) || tick < 0 || tick >= 64)
      throw Error("时间落点须为 0–63 tick");
    if (!["block", "up", "down"].includes(mode)) throw Error("放置方式无效");
    const pitches = voice(chord);
    if (mode === "down") pitches.reverse();
    if (tick + (mode === "block" ? 0 : pitches.length - 1) >= 64)
      throw Error("分解和弦超出四小节时间范围，请将落点向左移动");
    if (!Number.isInteger(velocity) || velocity < 1 || velocity > 100)
      throw Error("力度无效");
    return pitches.map((pitch, i) => ({
      tick: tick + (mode === "block" ? 0 : i),
      pitch,
      velocity,
      instrument,
      layer: i,
    }));
  }
  globalThis.PomeleneChords = Object.freeze({
    qualities,
    names,
    noteName,
    voice,
    palette,
    symbol,
    generate,
  });
})();
