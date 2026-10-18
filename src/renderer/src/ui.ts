import type { Command, Snapshot } from "../../shared/model";
import type { MenuItem } from "./ContextMenu";
export type Run = (command: Command) => Promise<Snapshot | undefined>;
export type ShowMenu = (x: number, y: number, items: MenuItem[]) => void;
export type RequestText = (
  title: string,
  value: string,
  submit: (value: string) => void,
) => void;
export interface Source {
  kind: "pattern" | "sample";
  id: string;
}
