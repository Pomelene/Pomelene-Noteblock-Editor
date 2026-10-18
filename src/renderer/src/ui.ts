import type { Command, Snapshot, Project } from "../../shared/model";
import type { MenuItem } from "./ContextMenu";
export type Run = (command: Command) => Promise<Snapshot | undefined>;
export type ShowMenu = (x: number, y: number, items: MenuItem[]) => void;
export type RequestText = (
  title: string,
  value: string,
  submit: (value: string) => void,
) => void;
export interface Source {
  kind: "pattern" | "phrase" | "sample";
  id: string;
}
export const getSource = (project: Project, source: Source) =>
  source.kind === "pattern"
    ? project.patterns.find((p) => p.id === source.id)
    : source.kind === "phrase"
      ? project.phrases?.find((p) => p.id === source.id)
      : project.samples.find((p) => p.id === source.id);
