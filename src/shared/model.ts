import type { NbsControlEvent } from "./nbsEvents";
import type { NbsMetadata } from "../legacy/nbs";
export interface Note {
  id: string;
  tick: number;
  layer: number;
  pitch: number;
  instrument: number;
  velocity: number;
  panning?: number;
  finePitch?: number;
}
export interface Layer {
  id: string;
  name: string;
  volume: number;
  panning: number;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  sourceIndex?: number;
}
export interface Pattern {
  id: string;
  name: string;
  color: string;
  length: number;
  notes: Note[];
  layers: Layer[];
}
/** A reusable note snapshot. Only its display metadata is editable. */
export interface PhraseSample extends Pattern {}
export interface Sample {
  id: string;
  name: string;
  color: string;
  builtin?: string;
  dataUrl?: string;
  originalPath?: string;
  rootKey: number;
  volume: number;
  panning: number;
  duration?: number;
}
export interface Instrument {
  id: number;
  name: string;
  sampleId: string;
  key: number;
  pressKey: boolean;
  /** Optional playback/export substitute; source identity and tuning stay intact. */
  mappingTargetId?: number;
}
export interface Track {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  locked: boolean;
}
export interface Clip {
  id: string;
  kind: "pattern" | "phrase" | "sample";
  sourceId: string;
  tick: number;
  length: number;
  offset: number;
  track: number;
  muted: boolean;
  /** Imported phrase triggers may ring across visual boundaries, up to this offset. */
  tailTicks?: number;
}
export interface NbsImportSummary {
  fileName: string;
  title: string;
  noteCount: number;
  layerCount: number;
  durationTicks: number;
  bpm: number;
  meter: string;
  algorithmVersion: string;
  applicable: boolean;
  original: { patterns: number; clips: number; tracks: number };
  proposed: {
    patterns: number;
    clips: number;
    tracks: number;
    reusedClips: number;
  };
  groups: {
    name: string;
    sourceLayers: number[];
    noteCount: number;
    patternCount: number;
    clipCount: number;
  }[];
  warnings: string[];
}
export interface ImportPrompt {
  id: string;
  summary: NbsImportSummary;
}
export interface ImportOrganization {
  version: "nbs-structure-1";
  summary: NbsImportSummary;
  /** Immutable JSON layout backup; audio is referenced from the project, not copied. */
  originalData: string;
}
export interface Project {
  schema: 2;
  id: string;
  title: string;
  bpm: number;
  meter: string;
  patterns: Pattern[];
  phrases?: PhraseSample[];
  samples: Sample[];
  instruments: Instrument[];
  tracks: Track[];
  clips: Clip[];
  loop: { enabled: boolean; start: number; end: number };
  nbs?: NbsMetadata;
  nbsEvents?: NbsControlEvent[];
  importOrganization?: ImportOrganization;
}
export interface Snapshot {
  project: Project;
  revision: number;
  generation: number;
  canUndo: boolean;
  canRedo: boolean;
  document: { path?: string; dirty: boolean };
}
export type Command =
  | { type: "instrument:map"; id: number; targetId?: number }
  | { type: "import:restoreOriginal" }
  | { type: "phrase:fromPattern"; patternId: string; name?: string }
  | { type: "phrase:fromClips"; ids: string[]; name?: string }
  | {
      type: "phrase:update";
      id: string;
      patch: Partial<Pick<PhraseSample, "name" | "color">>;
    }
  | { type: "phrase:remove"; id: string }
  | { type: "pattern:fromPhrase"; phraseId: string }
  | {
      type: "project:update";
      patch: Partial<Pick<Project, "title" | "bpm" | "meter" | "loop">>;
    }
  | { type: "pattern:add"; name?: string; duplicateId?: string }
  | {
      type: "pattern:update";
      id: string;
      patch: Partial<Pick<Pattern, "name" | "color" | "length">>;
    }
  | { type: "pattern:remove"; id: string }
  | { type: "notes:add"; patternId: string; notes: Omit<Note, "id">[] }
  | {
      type: "notes:update";
      patternId: string;
      ids: string[];
      patch: Partial<Omit<Note, "id" | "tick" | "layer">>;
    }
  | {
      type: "notes:move";
      patternId: string;
      ids: string[];
      ticks: number;
      pitches?: number;
      layers?: number;
    }
  | { type: "notes:remove"; patternId: string; ids: string[] }
  | { type: "layer:add"; patternId: string }
  | {
      type: "layer:update";
      patternId: string;
      index: number;
      patch: Partial<Omit<Layer, "id">>;
    }
  | { type: "layer:remove"; patternId: string; index: number }
  | { type: "clip:add"; clip: Omit<Clip, "id"> }
  | {
      type: "clips:update";
      ids: string[];
      patch: Partial<Omit<Clip, "id" | "kind" | "sourceId">>;
    }
  | { type: "clips:move"; ids: string[]; ticks: number; tracks: number }
  | { type: "clips:remove"; ids: string[] }
  | { type: "clips:paste"; clips: Omit<Clip, "id">[] }
  | { type: "source:unique"; clipId: string }
  | {
      type: "sample:update";
      id: string;
      patch: Partial<
        Pick<Sample, "name" | "color" | "rootKey" | "volume" | "panning">
      >;
    }
  | { type: "sample:clone"; id: string }
  | { type: "sample:remove"; id: string }
  | {
      type: "instrument:update";
      id: number;
      patch: Partial<Pick<Instrument, "name" | "key" | "pressKey">>;
    }
  | { type: "track:add"; name?: string }
  | { type: "track:update"; id: string; patch: Partial<Omit<Track, "id">> }
  | { type: "track:remove"; id: string }
  | { type: "undo" | "redo" };
export type FileAction =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "exportNbs"
  | "exportInstruments"
  | "importSample"
  | "importPhrase"
  | "importInstruments";
export interface FileResult {
  snapshot: Snapshot;
  ok: boolean;
  warnings: string[];
}
export interface TransportState {
  status: "stopped" | "loading" | "playing" | "paused";
  tick: number;
  scope: string;
  error?: string;
}
export type AudioSignal =
  | { type: "claim"; owner: string }
  | { type: "release"; owner: string }
  | { type: "state"; owner: string; state: TransportState }
  | {
      type: "control";
      command: "pause" | "stop" | "play" | "seek";
      tick?: number;
    };
export type EditorKind = "pattern" | "phrase" | "sample" | "playlist";
export interface DockedEditor {
  kind: EditorKind;
  id: string;
  generation: number;
  transport?: TransportState;
}
export interface StudioAPI {
  onImportPrompt(fn: (prompt: ImportPrompt | null) => void): () => void;
  respondImport(
    id: string,
    mode: "smart" | "original" | "cancel",
  ): Promise<void>;
  getSnapshot(): Promise<Snapshot>;
  dispatch(command: Command, originGeneration?: number): Promise<Snapshot>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  file(action: FileAction): Promise<FileResult>;
  openEditor(kind: EditorKind, id: string): Promise<void>;
  dockEditor(): Promise<void>;
  onDockEditor(fn: (editor: DockedEditor) => void): () => void;
  controlWindow(action: "maximize" | "minimize"): Promise<void>;
  audioSignal(signal: AudioSignal): Promise<void>;
  onAudioSignal(fn: (s: AudioSignal) => void): () => void;
  readClipboard(): Promise<Omit<Note, "id">[]>;
  writeClipboard(notes: Omit<Note, "id">[]): Promise<void>;
}
export const ticksPerBar = (meter: string) => {
  const [n, d] = meter.split("/").map(Number);
  return (n * 16) / d;
};
export const pitchName = (pitch: number) =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
    pitch % 12
  ] +
  (Math.floor(pitch / 12) - 1);
