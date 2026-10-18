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
export interface Pattern {
  id: string;
  name: string;
  length: number;
  notes: Note[];
  layerCount?: number;
}
export interface Clip {
  id: string;
  patternId: string;
  tick: number;
  track: number;
}
export interface Project {
  title: string;
  bpm: number;
  meter: string;
  patterns: Pattern[];
  clips: Clip[];
}
