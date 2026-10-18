import { randomUUID } from "node:crypto";
import type { ImportPrompt, NbsImportSummary } from "../shared/model";
export type ImportChoice = "smart" | "original" | "cancel";
interface Pending {
  owner: number;
  id: string;
  resolve: (choice: ImportChoice) => void;
  send: (prompt: ImportPrompt | null) => void;
}
/** One document transaction, one owning renderer, one unguessable response token. */
export class ImportBroker {
  private pending?: Pending;
  request(
    owner: number,
    summary: NbsImportSummary,
    send: Pending["send"],
  ): Promise<ImportChoice> {
    if (this.pending) throw new Error("已有导入选项正在等待处理");
    return new Promise((resolve) => {
      const id = randomUUID();
      this.pending = { owner, id, resolve, send };
      try {
        send({ id, summary });
      } catch {
        this.finish("cancel");
      }
    });
  }
  respond(owner: number, id: string, choice: ImportChoice): void {
    if (!this.pending || this.pending.owner !== owner || this.pending.id !== id)
      throw new Error("此导入请求已失效或不属于当前窗口");
    if (!["smart", "original", "cancel"].includes(choice))
      throw new Error("导入选项无效");
    this.finish(choice);
  }
  cancelFor(owner: number): boolean {
    if (this.pending?.owner !== owner) return false;
    return this.cancelPending();
  }
  cancelPending(): boolean {
    if (!this.pending) return false;
    this.finish("cancel");
    return true;
  }
  private finish(choice: ImportChoice): void {
    const current = this.pending;
    if (!current) return;
    this.pending = undefined;
    try {
      current.send(null);
    } catch {
      /* The renderer may already be closed. */
    }
    current.resolve(choice);
  }
}
