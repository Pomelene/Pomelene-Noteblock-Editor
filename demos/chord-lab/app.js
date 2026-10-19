(() => {
  "use strict";
  const E = globalThis.PomeleneChords;
  const $ = (id) => document.getElementById(id);
  const defaults = {
    cursor: 0,
    tonic: 0,
    scale: "major",
    stripOctave: 4,
    root: 0,
    octave: 4,
    quality: "major",
    inversion: 0,
    extension: "none",
    bass: "none",
    spread: false,
    placement: "block",
    instrument: "harp",
    velocity: 80,
    bpm: 120,
    snap: 4,
    rowHeight: 22,
    advance: false,
    advanceStep: 4,
    collision: "replace",
    groups: [],
    selectedGroup: null,
  };
  const state = structuredClone(defaults);
  const STORAGE_KEY = "pomelene-chord-lab-demo-01";
  const history = [],
    future = [];
  let sequence = 0,
    context,
    audioGeneration = 0,
    sources = new Set(),
    buffers = new Map(),
    frame,
    playback;
  const lowPitch = 21,
    highPitch = 108;
  const option = (value, text) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  };
  for (const id of ["root", "tonic"])
    E.names.forEach((name, i) => $(id).append(option(i, name)));
  E.names.forEach((name, i) =>
    $("bass").append(option(i, name + " / 备用低音")),
  );
  Object.entries(E.qualities).forEach(([key, q]) =>
    $("quality").append(option(key, q.label)),
  );
  function say(message, error = false) {
    $("feedback").textContent = message;
    $("feedback").classList.toggle("error", error);
  }
  function musicSnapshot() {
    return JSON.stringify({
      groups: state.groups,
      cursor: state.cursor,
      selectedGroup: state.selectedGroup,
    });
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $("save-state").textContent = "独立试验 · 本机已暂存";
    } catch {
      $("save-state").textContent = "独立试验 · 本次会话";
    }
  }
  function restore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!value || !Array.isArray(value.groups) || value.groups.length > 256)
        return;
      const groups = value.groups.filter(
        (g) =>
          typeof g.id === "string" &&
          typeof g.name === "string" &&
          Number.isInteger(g.origin) &&
          g.origin >= 0 &&
          g.origin < 64 &&
          Array.isArray(g.notes) &&
          g.notes.length <= 10 &&
          g.notes.every(
            (n) =>
              typeof n.id === "string" &&
              Number.isInteger(n.tick) &&
              n.tick >= 0 &&
              n.tick < 64 &&
              Number.isInteger(n.pitch) &&
              n.pitch >= 21 &&
              n.pitch <= 108 &&
              Number.isInteger(n.velocity) &&
              n.velocity >= 1 &&
              n.velocity <= 100 &&
              ["harp", "pling"].includes(n.instrument),
          ),
      );
      state.groups = groups;
      if (
        Number.isInteger(value.cursor) &&
        value.cursor >= 0 &&
        value.cursor < 64
      )
        state.cursor = value.cursor;
      if (Number.isFinite(value.bpm) && value.bpm >= 30 && value.bpm <= 300)
        state.bpm = value.bpm;
      if (groups.length) say(`已恢复本机暂存的 ${groups.length} 组和弦。`);
    } catch {
      /* A bad or unavailable local cache does not block a fresh experiment. */
    }
  }
  function commit(edit) {
    const before = musicSnapshot();
    edit();
    if (musicSnapshot() === before) return;
    history.push(before);
    if (history.length > 64) history.shift();
    future.length = 0;
    render();
    persist();
  }
  function undo() {
    if (!history.length) return;
    stopAudio();
    future.push(musicSnapshot());
    Object.assign(state, JSON.parse(history.pop()));
    render();
    persist();
    say("已撤销整次放置或删除。");
  }
  function redo() {
    if (!future.length) return;
    stopAudio();
    history.push(musicSnapshot());
    Object.assign(state, JSON.parse(future.pop()));
    render();
    persist();
    say("已重做。");
  }
  function spec(base) {
    return {
      root: 12 * (state.octave + 1) + state.root,
      quality: state.quality,
      inversion: state.inversion,
      extension: state.extension,
      bass:
        state.bass === "none"
          ? null
          : state.bass === "root"
            ? "root"
            : Number(state.bass),
      spread: state.spread,
      ...base,
    };
  }
  const generationOptions = () => ({
    tick: state.cursor,
    mode: state.placement,
    velocity: state.velocity,
    instrument: state.instrument,
  });
  function positionLabel(tick) {
    return `${String(Math.floor(tick / 16) + 1).padStart(2, "0")} : ${String(Math.floor((tick % 16) / 4) + 1).padStart(2, "0")} : ${String(tick % 4).padStart(3, "0")}`;
  }
  function setCursor(tick) {
    state.cursor = Math.max(0, Math.min(63, tick));
    state.selectedGroup = null;
    say(
      `落点：第 ${Math.floor(state.cursor / 16) + 1} 小节，第 ${Math.floor((state.cursor % 16) / 4) + 1} 拍，tick ${state.cursor}。点击和弦卡片即可放置。`,
    );
    render();
    persist();
  }
  function palette() {
    return E.palette(state.tonic, state.scale, state.stripOctave);
  }
  function place(chord = spec()) {
    try {
      const generated = E.generate(chord, generationOptions());
      const name = E.symbol(chord),
        origin = state.cursor;
      if (
        state.groups.length >= 256 &&
        !(
          state.collision === "replace" &&
          state.groups.some((g) => g.origin === origin)
        )
      )
        throw Error("本 demo 最多暂存 256 组和弦，请先清理或导出。");
      stopAudio();
      commit(() => {
        if (state.collision === "replace")
          state.groups = state.groups.filter((g) => g.origin !== origin);
        const id = `chord-${Date.now()}-${++sequence}`;
        state.groups.push({
          id,
          origin,
          chord: structuredClone(chord),
          name,
          notes: generated.map((n, i) => ({ ...n, id: `${id}-${i}` })),
        });
        state.selectedGroup = id;
        if (state.advance)
          state.cursor = Math.min(63, origin + state.advanceStep);
      });
      say(
        `已在 tick ${origin} 放置 ${name} · ${generated.map((n) => E.noteName(n.pitch)).join(" / ")}。`,
      );
      ensurePitchVisible(generated.map((n) => n.pitch));
      void audition(generated, "preview");
    } catch (error) {
      say(error.message, true);
    }
  }
  function choosePad(base) {
    const chord = spec(base);
    state.root = chord.root % 12;
    state.octave = Math.floor(chord.root / 12) - 1;
    state.quality = chord.quality;
    renderControls();
    place(chord);
  }
  function buildGrid() {
    $("keys").replaceChildren();
    $("lanes").replaceChildren();
    for (let pitch = highPitch; pitch >= lowPitch; pitch--) {
      const black = [1, 3, 6, 8, 10].includes(pitch % 12);
      const key = document.createElement("div");
      key.className = `piano-key${black ? " black" : ""}${pitch % 12 === 0 ? " c" : ""}`;
      key.dataset.pitch = pitch;
      key.textContent = E.noteName(pitch);
      $("keys").append(key);
      const lane = document.createElement("div");
      lane.className = `pitch-lane${black ? " black" : ""}${pitch % 12 === 0 ? " c" : ""}`;
      $("lanes").append(lane);
    }
    for (let beat = 0; beat < 16; beat++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = beat % 4 === 0 ? "bar-start" : "";
      button.textContent =
        beat % 4 === 0
          ? String(Math.floor(beat / 4) + 1).padStart(2, "0")
          : "·";
      button.setAttribute(
        "aria-label",
        `选择第 ${Math.floor(beat / 4) + 1} 小节第 ${(beat % 4) + 1} 拍`,
      );
      button.onclick = () => setCursor(beat * 4);
      $("beat-ruler").append(button);
    }
  }
  function noteElement(note, group, ghost = false) {
    const node = document.createElement(ghost ? "span" : "button");
    node.className = `note${ghost ? " ghost" : state.selectedGroup === group?.id ? " selected" : ""}`;
    node.style.left = `${(note.tick / 64) * 100}%`;
    node.style.top = `${(highPitch - note.pitch) * state.rowHeight}px`;
    if (!ghost) {
      node.type = "button";
      node.dataset.noteId = note.id;
      node.dataset.tick = note.tick;
      node.dataset.pitch = note.pitch;
      node.title = `${group.name} · ${E.noteName(note.pitch)} · tick ${note.tick} · 右键删除`;
      node.setAttribute(
        "aria-label",
        `${E.noteName(note.pitch)}，tick ${note.tick}，${group.name}`,
      );
      node.onclick = (event) => {
        event.stopPropagation();
        state.cursor = group.origin;
        state.selectedGroup = group.id;
        render();
        persist();
        say(`选中 ${group.name}，落点 tick ${group.origin}。`);
      };
      node.oncontextmenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        stopAudio();
        commit(() => {
          group.notes = group.notes.filter((n) => n.id !== note.id);
          state.groups = state.groups.filter((g) => g.notes.length);
        });
        say(`已删除 ${E.noteName(note.pitch)}，可撤销。`);
      };
    }
    return node;
  }
  function renderGhost(chord = spec()) {
    $("ghosts").replaceChildren();
    document
      .querySelectorAll(".piano-key.active")
      .forEach((k) => k.classList.remove("active"));
    try {
      const notes = E.generate(chord, generationOptions());
      notes.forEach((n) => {
        $("ghosts").append(noteElement(n, null, true));
        document
          .querySelector(`.piano-key[data-pitch="${n.pitch}"]`)
          ?.classList.add("active");
      });
    } catch {
      /* Invalid choices are disclosed by the custom controls. */
    }
  }
  function renderPads() {
    $("chord-pads").replaceChildren();
    for (const base of palette()) {
      const chord = spec(base),
        button = document.createElement("button");
      button.type = "button";
      button.className = "chord-pad";
      const degree = document.createElement("span");
      degree.className = "degree";
      degree.textContent = base.degree;
      const name = document.createElement("strong");
      const action = document.createElement("span");
      action.className = "pad-action";
      action.textContent = "点击放置";
      try {
        name.textContent = E.symbol(chord);
        E.generate(chord, generationOptions());
        button.title = `${name.textContent} · ${E.voice(chord).map(E.noteName).join(" / ")} · 快捷键 ${$("chord-pads").childElementCount + 1}`;
        button.setAttribute("aria-label", `放置 ${name.textContent} 和弦`);
      } catch (error) {
        name.textContent =
          E.names[chord.root % 12] + E.qualities[chord.quality].suffix;
        button.disabled = true;
        button.title = error.message;
      }
      if (chord.root % 12 === state.root && chord.quality === state.quality)
        button.classList.add("is-active");
      button.append(degree, name, action);
      button.onclick = () => choosePad(base);
      button.onpointerenter = button.onfocus = () => renderGhost(chord);
      button.onpointerleave = button.onblur = () => renderGhost();
      $("chord-pads").append(button);
    }
  }
  function renderControls() {
    for (const [id, property] of Object.entries({
      root: "root",
      octave: "octave",
      quality: "quality",
      inversion: "inversion",
      extension: "extension",
      bass: "bass",
      placement: "placement",
      instrument: "instrument",
      velocity: "velocity",
      bpm: "bpm",
      tonic: "tonic",
      scale: "scale",
      "strip-octave": "stripOctave",
      snap: "snap",
      "row-height": "rowHeight",
      "advance-step": "advanceStep",
      collision: "collision",
    }))
      $(id).value = state[property];
    $("spread").checked = state.spread;
    $("advance").checked = state.advance;
    $("advance-step").disabled = !state.advance;
  }
  function render() {
    document.documentElement.style.setProperty("--row", `${state.rowHeight}px`);
    $("position-label").textContent = positionLabel(state.cursor);
    $("tick-label").textContent = `TICK ${state.cursor}`;
    $("insert-cursor").style.left = `${(state.cursor / 64) * 100}%`;
    [...$("beat-ruler").children].forEach((b, i) =>
      b.classList.toggle("selected", i === Math.floor(state.cursor / 4)),
    );
    $("notes").replaceChildren();
    for (const group of state.groups)
      group.notes.forEach((n) => $("notes").append(noteElement(n, group)));
    const count = state.groups.reduce((sum, g) => sum + g.notes.length, 0);
    $("note-count").textContent = `${count} NOTES`;
    $("undo").disabled = !history.length;
    $("redo").disabled = !future.length;
    $("clear").disabled = !count;
    $("export").disabled = !count;
    $("play").disabled = !count;
    $("scale-caption").textContent =
      `${E.names[state.tonic]} ${state.scale === "major" ? "大调" : "自然小调"} · 卡片点击即放置`;
    $("velocity-value").textContent = state.velocity;
    try {
      const chord = spec(),
        name = E.symbol(chord),
        pitches = E.voice(chord);
      E.generate(chord, generationOptions());
      $("chord-name").textContent = name;
      $("place").textContent = `放置 ${name} ＋`;
      $("tone-names").replaceChildren(
        ...pitches.map((pitch) => {
          const chip = document.createElement("span");
          chip.textContent = E.noteName(pitch);
          return chip;
        }),
      );
      $("place").disabled = false;
      $("preview").disabled = false;
      if ($("feedback").classList.contains("error"))
        say("当前和弦可以放置；虚线为待写入音符。");
    } catch (error) {
      $("chord-name").textContent = "超出范围";
      $("tone-names").replaceChildren();
      $("place").disabled = true;
      $("preview").disabled = true;
      say(error.message, true);
    }
    renderPads();
    renderGhost();
  }
  function ensurePitchVisible(pitches) {
    if (!pitches.length) return;
    const scroller = $("roll-scroll"),
      top = (highPitch - Math.max(...pitches)) * state.rowHeight + 32,
      bottom = (highPitch - Math.min(...pitches) + 1) * state.rowHeight + 32;
    if (
      top < scroller.scrollTop + 45 ||
      bottom > scroller.scrollTop + scroller.clientHeight - 10
    )
      scroller.scrollTop = Math.max(
        0,
        top - Math.max(50, (scroller.clientHeight - (bottom - top)) / 2),
      );
  }
  function stopAudio() {
    audioGeneration++;
    cancelAnimationFrame(frame);
    playback = null;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    sources.clear();
    $("play-cursor").hidden = true;
    $("play").querySelector("span").textContent = "播放片段";
    $("preview").textContent = "试听和弦";
  }
  async function bufferFor(instrument) {
    if (!buffers.has(instrument)) {
      const bytes = Uint8Array.from(
        atob(globalThis.PomeleneChordSamples[instrument].split(",")[1]),
        (char) => char.charCodeAt(0),
      );
      buffers.set(
        instrument,
        context.decodeAudioData(bytes.buffer).catch((error) => {
          buffers.delete(instrument);
          throw error;
        }),
      );
    }
    return buffers.get(instrument);
  }
  async function audition(notes, kind) {
    stopAudio();
    const generation = audioGeneration;
    try {
      context ??= new AudioContext();
      await context.resume();
      const loaded = new Map(
        await Promise.all(
          [...new Set(notes.map((n) => n.instrument))].map(
            async (instrument) => [instrument, await bufferFor(instrument)],
          ),
        ),
      );
      if (generation !== audioGeneration) return;
      const startTick =
        kind === "song" ? 0 : Math.min(...notes.map((n) => n.tick));
      const start = context.currentTime + 0.035,
        secondsPerTick = 60 / state.bpm / 4;
      let end = kind === "song" ? 64 * secondsPerTick : 0;
      for (const note of notes) {
        const buffer = loaded.get(note.instrument),
          source = context.createBufferSource(),
          gain = context.createGain();
        const rate = 2 ** ((note.pitch - 66) / 12),
          when = start + (note.tick - startTick) * secondsPerTick;
        const duration = Math.min(3, buffer.duration / rate);
        source.buffer = buffer;
        source.playbackRate.value = rate;
        gain.gain.value = (0.38 * note.velocity) / 100;
        source.connect(gain).connect(context.destination);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
          gain.disconnect();
        };
        source.start(when);
        source.stop(when + duration);
        end = Math.max(end, when - start + duration);
      }
      playback = { kind, generation };
      if (kind === "song")
        $("play").querySelector("span").textContent = "停止播放";
      else $("preview").textContent = "停止试听";
      const step = () => {
        if (generation !== audioGeneration) return;
        const elapsed = context.currentTime - start;
        if (elapsed >= end + 0.02) {
          stopAudio();
          return;
        }
        if (kind === "song") {
          $("play-cursor").hidden = false;
          $("play-cursor").style.left =
            `${(Math.max(0, Math.min(63.9, elapsed / secondsPerTick)) / 64) * 100}%`;
        }
        frame = requestAnimationFrame(step);
      };
      step();
    } catch (error) {
      if (generation === audioGeneration) {
        stopAudio();
        say(`试听失败：${error.message}`, true);
      }
    }
  }
  const playSong = () => {
    if (playback?.kind === "song") {
      stopAudio();
      return;
    }
    const notes = state.groups.flatMap((g) => g.notes);
    if (!notes.length) {
      say("先放置一个和弦，再播放片段。");
      return;
    }
    void audition(notes, "song");
  };
  const numeric = new Set([
    "root",
    "octave",
    "inversion",
    "velocity",
    "bpm",
    "tonic",
    "stripOctave",
    "snap",
    "rowHeight",
    "advanceStep",
  ]);
  for (const [id, property] of Object.entries({
    root: "root",
    octave: "octave",
    quality: "quality",
    inversion: "inversion",
    extension: "extension",
    bass: "bass",
    spread: "spread",
    placement: "placement",
    instrument: "instrument",
    velocity: "velocity",
    bpm: "bpm",
    tonic: "tonic",
    scale: "scale",
    "strip-octave": "stripOctave",
    snap: "snap",
    "row-height": "rowHeight",
    advance: "advance",
    "advance-step": "advanceStep",
    collision: "collision",
  })) {
    $(id).addEventListener(id === "velocity" ? "input" : "change", (event) => {
      const input = event.target;
      let value =
        input.type === "checkbox"
          ? input.checked
          : numeric.has(property)
            ? Number(input.value)
            : input.value;
      if (property === "bpm") {
        if (!Number.isFinite(value) || value < 30 || value > 300) {
          input.value = state.bpm;
          say("BPM 请设为 30–300。", true);
          return;
        }
        stopAudio();
      }
      const oldHeight = state.rowHeight,
        oldTop = $("roll-scroll").scrollTop;
      state[property] = value;
      renderControls();
      render();
      persist();
      if (property === "rowHeight")
        $("roll-scroll").scrollTop = (oldTop / oldHeight) * state.rowHeight;
      if (
        ["root", "octave", "inversion", "extension", "bass", "spread"].includes(
          property,
        )
      ) {
        try {
          ensurePitchVisible(E.voice(spec()));
        } catch {
          /* already disclosed */
        }
      }
    });
  }
  $("note-field").addEventListener("click", (event) => {
    if (event.target.closest(".note")) return;
    const rect = $("note-field").getBoundingClientRect(),
      raw = ((event.clientX - rect.left) / rect.width) * 64;
    setCursor(
      Math.max(
        0,
        Math.min(64 - state.snap, Math.floor(raw / state.snap) * state.snap),
      ),
    );
  });
  $("note-field").addEventListener("contextmenu", (event) =>
    event.preventDefault(),
  );
  $("place").onclick = () => place();
  $("preview").onclick = () => {
    if (playback?.kind === "preview") stopAudio();
    else {
      try {
        void audition(E.generate(spec(), generationOptions()), "preview");
      } catch (error) {
        say(error.message, true);
      }
    }
  };
  $("undo").onclick = undo;
  $("redo").onclick = redo;
  $("play").onclick = playSong;
  $("stop").onclick = () => {
    stopAudio();
    say("播放已停止，插入落点保留。");
  };
  $("clear").onclick = () => {
    stopAudio();
    commit(() => {
      state.groups = [];
      state.selectedGroup = null;
    });
    say("已清空，可通过撤销恢复。");
  };
  $("export").onclick = () => {
    const data = {
      format: "pomelene-chord-lab",
      version: 1,
      timebase: { ticksPerBeat: 4, meter: "4/4", bpm: state.bpm },
      groups: state.groups,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "pomelene-chord-lab-notes.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("已导出 demo 音符数据；这不是正式工程或 NBS 文件。");
  };
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,select,textarea")) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (ctrl && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor(
        state.cursor + (event.key === "ArrowRight" ? state.snap : -state.snap),
      );
    } else if (
      event.code === "Space" &&
      !event.repeat &&
      event.target.tagName !== "BUTTON"
    ) {
      event.preventDefault();
      playSong();
    } else if (event.key === "Escape") stopAudio();
    else if (!ctrl && !event.altKey && /^[1-7]$/.test(event.key)) {
      event.preventDefault();
      choosePad(palette()[Number(event.key) - 1]);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAudio();
  });
  window.addEventListener("pagehide", stopAudio);
  restore();
  buildGrid();
  renderControls();
  render();
  requestAnimationFrame(() => ensurePitchVisible(E.voice(spec())));
  window.PomeleneChordDemo = Object.freeze({
    getState: () => structuredClone(state),
    getPlaybackState: () => ({
      kind: playback?.kind,
      sources: sources.size,
      generation: audioGeneration,
      contextState: context?.state,
    }),
  });
})();
