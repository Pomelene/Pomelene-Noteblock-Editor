import type {
  AudioSignal,
  Project,
  Sample,
  StudioAPI,
  TransportState,
} from "../../shared/model";
import {
  buildEvents,
  noteEvent,
  sampleEvent,
  type AudioEvent,
  type EventPlan,
} from "../../shared/timeline";

type Bridge = Pick<StudioAPI, "audioSignal" | "onAudioSignal">;
interface EngineOptions {
  createContext?: () => AudioContext;
  bridge?: Bridge;
}
interface Running {
  plan: EventPlan;
  buffers: Map<string, AudioBuffer>;
  tick: number;
  time: number;
  next: number;
  scheduleTick: number;
  scheduleTime: number;
}

/** Audio-clock transport. UI timers only feed its lookahead and publish the cursor. */
export class AudioEngine {
  private context?: AudioContext;
  private readonly createContext: () => AudioContext;
  private readonly owner =
    globalThis.crypto?.randomUUID?.() ??
    `audio-${Math.random().toString(36).slice(2)}`;
  private bridge?: Bridge;
  private bridgeConnected = false;
  private owns = false;
  private remoteOwner?: string;
  private listeners = new Set<(state: TransportState) => void>();
  private state: TransportState = { status: "stopped", tick: 0, scope: "song" };
  private project?: Project;
  private generation = 0;
  private loading = false;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Running;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private sources = new Set<AudioBufferSourceNode>();
  private lastPublish = 0;
  constructor(options: EngineOptions = {}) {
    this.createContext = options.createContext ?? (() => new AudioContext());
    this.bridge = options.bridge;
    this.connectBridge();
  }
  private connectBridge() {
    if (this.bridgeConnected) return;
    this.bridge ??= typeof window !== "undefined" ? window.studio : undefined;
    if (this.bridge) {
      this.bridge.onAudioSignal((s) => this.receive(s));
      this.bridgeConnected = true;
    }
  }
  private signal(signal: AudioSignal) {
    this.connectBridge();
    return this.bridge?.audioSignal(signal) ?? Promise.resolve();
  }
  private receive(signal: AudioSignal) {
    if (
      signal.type === "release" &&
      signal.owner === this.remoteOwner &&
      !this.owns
    ) {
      this.cancel();
      this.remoteOwner = undefined;
      this.setState(
        { ...this.state, status: "stopped", tick: 0, error: undefined },
        false,
      );
    } else if (signal.type === "claim" && signal.owner !== this.owner) {
      this.cancel();
      this.owns = false;
      this.remoteOwner = signal.owner;
      this.setState(
        { ...this.state, status: "stopped", tick: 0, error: undefined },
        false,
      );
    } else if (
      signal.type === "state" &&
      signal.owner !== this.owner &&
      !this.owns
    ) {
      if (this.remoteOwner && this.remoteOwner !== signal.owner) return;
      this.remoteOwner = signal.owner;
      if (this.loading) return;
      this.setState({ ...signal.state }, false);
    } else if (signal.type === "control" && this.owns) {
      if (signal.command === "pause") this.pause();
      else if (signal.command === "stop") this.stop();
      else if (signal.command === "seek" && signal.tick !== undefined)
        this.seek(signal.tick);
      else if (signal.command === "play" && this.project)
        void this.play(this.project, this.state.scope).catch(() => {});
    }
  }
  private setState(state: TransportState, broadcast = true) {
    this.state = state;
    for (const fn of this.listeners) fn({ ...state });
    if (broadcast && this.owns)
      void this.signal({
        type: "state",
        owner: this.owner,
        state: { ...state },
      }).catch(() => {});
  }
  subscribe(fn: (state: TransportState) => void): () => void {
    this.connectBridge();
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }
  getState(): TransportState {
    return { ...this.state, tick: this.clockTick() };
  }
  private clockTick() {
    if (this.state.status !== "playing" || !this.running || !this.context)
      return this.state.tick;
    const r = this.running;
    const raw = Math.max(
      r.tick,
      r.tick + (this.context.currentTime - r.time) / r.plan.secondsPerTick,
    );
    const loop = this.project?.loop,
      end = this.boundary(r.plan);
    if (
      this.state.scope === "song" &&
      loop?.enabled &&
      loop.end > loop.start &&
      raw >= end
    ) {
      return loop.start + ((raw - end) % (loop.end - loop.start));
    }
    return Math.min(end, raw);
  }
  private audioContext() {
    return (this.context ??= this.createContext());
  }
  private url(sample: Sample) {
    if (sample.dataUrl) return sample.dataUrl;
    if (!sample.builtin) throw new Error(`Sample has no audio: ${sample.name}`);
    const filename = sample.builtin.endsWith(".ogg")
      ? sample.builtin
      : `${sample.builtin}.ogg`;
    if (!/^[a-z0-9_-]+\.ogg$/i.test(filename))
      throw new Error(`Invalid built-in sample: ${sample.builtin}`);
    return new URL(`./sounds/${filename}`, document.baseURI).href;
  }
  private buffer(sample: Sample): Promise<AudioBuffer> {
    const url = this.url(sample);
    let promise = this.buffers.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((response) => {
          if (!response.ok)
            throw new Error(`Cannot load audio: ${sample.name}`);
          return response.arrayBuffer();
        })
        .then((bytes) => this.audioContext().decodeAudioData(bytes))
        .catch((error) => {
          this.buffers.delete(url);
          throw error;
        });
      this.buffers.set(url, promise);
    }
    return promise;
  }
  private cancel() {
    this.generation++;
    this.loading = false;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.running = undefined;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
  }
  private boundary(plan: EventPlan) {
    const loop = this.project?.loop;
    return this.state.scope === "song" && loop?.enabled && loop.end > loop.start
      ? loop.end
      : plan.endTick;
  }
  private sound(
    event: AudioEvent,
    buffer: AudioBuffer,
    when: number,
    elapsedTicks: number,
    secondsPerTick: number,
    maxTicks = Infinity,
  ) {
    const ctx = this.audioContext();
    const offset =
      event.offsetTicks * secondsPerTick +
      elapsedTicks * secondsPerTick * event.playbackRate;
    const duration = Math.min(
      (event.durationTicks - elapsedTicks) * secondsPerTick,
      (buffer.duration - offset) / event.playbackRate,
      maxTicks * secondsPerTick,
    );
    if (
      !(duration > 0) ||
      !Number.isFinite(event.playbackRate) ||
      event.playbackRate <= 0
    )
      return;
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      panner = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = event.playbackRate;
    gain.gain.value = event.gain * 0.55;
    panner.pan.value = event.pan;
    source.connect(gain).connect(panner).connect(ctx.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start(when, offset);
    source.stop(when + duration);
  }
  private step = () => {
    const r = this.running,
      ctx = this.context;
    if (!r || !ctx || this.state.status !== "playing") return;
    const end = this.boundary(r.plan),
      nowTick = this.clockTick(),
      horizon = ctx.currentTime + 0.12;
    const loop = this.project?.loop,
      looping =
        this.state.scope === "song" && loop?.enabled && loop.end > loop.start;
    if (!looping && nowTick >= end) {
      this.stop();
      return;
    }
    // Look ahead across the loop boundary, so repetition starts at the exact
    // AudioContext deadline even when the UI timer wakes up later.
    for (let segments = 0; segments < 1024; segments++) {
      while (r.next < r.plan.events.length) {
        const event = r.plan.events[r.next];
        const actualTick = Math.max(
          event.tick,
          r.scheduleTick,
          r.scheduleTick +
            (ctx.currentTime - r.scheduleTime) / r.plan.secondsPerTick,
        );
        if (actualTick >= end) break;
        const when = Math.max(
          ctx.currentTime,
          r.scheduleTime +
            (actualTick - r.scheduleTick) * r.plan.secondsPerTick,
        );
        if (when >= horizon) break;
        r.next++;
        if (event.tick + event.durationTicks <= actualTick) continue;
        this.sound(
          event,
          r.buffers.get(event.sampleId)!,
          when,
          actualTick - event.tick,
          r.plan.secondsPerTick,
          end - actualTick,
        );
      }
      const boundaryTime =
        r.scheduleTime + (end - r.scheduleTick) * r.plan.secondsPerTick;
      if (!looping || boundaryTime >= horizon) break;
      r.scheduleTick = loop!.start;
      r.scheduleTime = boundaryTime;
      r.next = 0;
    }
    // IPC transport state stays at 20 Hz. Scheduled sources use AudioContext time.
    if (ctx.currentTime - this.lastPublish >= 0.05) {
      this.lastPublish = ctx.currentTime;
      this.setState({ ...this.state, tick: nowTick });
    }
  };
  async play(project: Project, scope = "song"): Promise<void> {
    const tick = this.state.scope === scope ? this.clockTick() : 0;
    this.cancel();
    const generation = this.generation;
    this.loading = true;
    this.project = project;
    this.setState({ status: "loading", tick, scope });
    try {
      const ctx = this.audioContext();
      await ctx.resume();
      if (generation !== this.generation) return;
      const plan = buildEvents(project, scope);
      const ids = [...new Set(plan.events.map((e) => e.sampleId))];
      const buffers = new Map(
        await Promise.all(
          ids.map(async (id) => {
            const sample = project.samples.find((s) => s.id === id)!;
            return [id, await this.buffer(sample)] as const;
          }),
        ),
      );
      if (generation !== this.generation) return;
      if (scope !== "song" && !project.patterns.some((p) => p.id === scope)) {
        plan.endTick = buffers.get(scope)!.duration / plan.secondsPerTick;
        plan.events[0].durationTicks = plan.endTick;
      }
      // Claim only once resources are ready, never after a cancelled load.
      this.owns = true;
      this.remoteOwner = undefined;
      await this.signal({ type: "claim", owner: this.owner });
      if (generation !== this.generation) return;
      const boundary = this.boundary(plan);
      const startTick =
        tick >= boundary
          ? scope === "song" && project.loop.enabled
            ? project.loop.start
            : 0
          : Math.max(0, tick);
      this.running = {
        plan,
        buffers,
        tick: startTick,
        time: ctx.currentTime + 0.025,
        next: 0,
        scheduleTick: startTick,
        scheduleTime: ctx.currentTime + 0.025,
      };
      this.loading = false;
      this.lastPublish = ctx.currentTime;
      this.setState({ status: "playing", tick: startTick, scope });
      this.timer = setInterval(this.step, 25);
      this.step();
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel();
      this.setState({
        status: "stopped",
        tick,
        scope,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  pause(): void {
    if (!this.owns && this.remoteOwner && !this.loading) {
      void this.signal({ type: "control", command: "pause" }).catch(() => {});
      return;
    }
    const tick = this.clockTick();
    this.cancel();
    this.setState({ ...this.state, status: "paused", tick });
  }
  stop(): void {
    if (!this.owns && this.remoteOwner && !this.loading) {
      void this.signal({ type: "control", command: "stop" }).catch(() => {});
      return;
    }
    this.cancel();
    this.setState({
      ...this.state,
      status: "stopped",
      tick: 0,
      error: undefined,
    });
  }
  seek(tick: number, scope = this.state.scope): void {
    if (!Number.isFinite(tick)) return;
    if (
      scope === this.state.scope &&
      !this.owns &&
      this.remoteOwner &&
      !this.loading
    ) {
      void this.signal({
        type: "control",
        command: "seek",
        tick: Math.max(0, tick),
      }).catch(() => {});
      return;
    }
    const active =
      this.state.status === "playing" || this.state.status === "loading";
    const end =
      this.running && scope === this.state.scope
        ? this.boundary(this.running.plan)
        : Infinity;
    this.cancel();
    this.setState({
      ...this.state,
      scope,
      tick: Math.min(end, Math.max(0, tick)),
      status: active ? "paused" : this.state.status,
      error: undefined,
    });
    if (active && this.project)
      void this.play(this.project, this.state.scope).catch(() => {});
  }
  updateProject(project: Project): void {
    if (project === this.project) return;
    if (this.project && this.project.id !== project.id) {
      this.cancel();
      this.project = project;
      this.setState({ status: "stopped", tick: 0, scope: "song" });
      return;
    }
    const active =
      (this.owns && this.state.status === "playing") || this.loading;
    const tick = this.clockTick();
    this.project = project;
    if (active) {
      this.cancel();
      this.setState({ ...this.state, status: "paused", tick });
      void this.play(project, this.state.scope).catch(() => {});
    }
  }
  private async previewEvent(project: Project, event: AudioEvent) {
    const generation = this.generation,
      ctx = this.audioContext();
    try {
      await ctx.resume();
      const sample = project.samples.find((s) => s.id === event.sampleId)!;
      const buffer = await this.buffer(sample);
      if (generation === this.generation)
        this.sound(event, buffer, ctx.currentTime, 0, 60 / project.bpm / 4);
    } catch (error) {
      if (generation === this.generation)
        this.setState({
          ...this.getState(),
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }
  async preview(
    project: Project,
    instrument: number,
    pitch: number,
    velocity = 80,
  ): Promise<void> {
    await this.previewEvent(
      project,
      noteEvent(project, {
        id: "preview",
        tick: 0,
        layer: 0,
        instrument,
        pitch,
        velocity,
      }),
    );
  }
  async previewSample(project: Project, sampleId: string): Promise<void> {
    await this.previewEvent(project, sampleEvent(project, sampleId));
  }
  async getSamplePeaks(project: Project, sampleId: string): Promise<number[]> {
    const sample = project.samples.find((s) => s.id === sampleId);
    if (!sample) throw new Error(`Missing sample: ${sampleId}`);
    const buffer = await this.buffer(sample),
      count = 160,
      peaks = new Array<number>(count).fill(0);
    const stride = Math.max(1, Math.ceil(buffer.length / count));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let bin = 0; bin < count; bin++) {
        for (
          let i = bin * stride;
          i < Math.min(data.length, (bin + 1) * stride);
          i++
        )
          peaks[bin] = Math.max(peaks[bin], Math.abs(data[i]));
      }
    }
    return peaks;
  }
  async getSampleDuration(project: Project, sampleId: string): Promise<number> {
    const sample = project.samples.find((s) => s.id === sampleId);
    if (!sample) throw new Error(`Missing sample: ${sampleId}`);
    return (await this.buffer(sample)).duration;
  }
}
export const audio = new AudioEngine();
export const getSamplePeaks = (project: Project, sampleId: string) =>
  audio.getSamplePeaks(project, sampleId);
