import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import type {
  BrowserWindow,
  OpenDialogOptions,
  SaveDialogOptions,
  MessageBoxOptions,
} from "electron";
import type {
  FileAction,
  FileResult,
  Project,
  Sample,
  NbsImportSummary,
} from "../shared/model";
import { organizeImportedProject } from "../shared/smartPattern";
import { isProjectV2 } from "../shared/projectCodec";
import { getNbsEventKind } from "../shared/nbsEvents";
import type { ImportChoice } from "./importBroker";
import { Session, createEmptyProject, uid } from "../shared/session";
import {
  decodeProject,
  encodeProject,
  fromNbs,
  MAX_PROJECT_BYTES,
  toNbs,
} from "../shared/io";
import {
  isAudioPath,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_TOTAL,
  readAudioZip,
  writeAudioZip,
  safeRelativePath,
} from "./zip";

export interface FileDialogs {
  open(
    kind:
      | "project"
      | "projectOnly"
      | "song"
      | "phrase"
      | "sample"
      | "instruments",
  ): Promise<string | undefined>;
  save(
    format: "project" | "nbs" | "instruments",
    suggested: string,
  ): Promise<string | undefined>;
  unsaved(): Promise<"save" | "discard" | "cancel">;
  sounds(): Promise<string | undefined>;
}
export interface FileStorage {
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array | string): Promise<void>;
}
export async function atomicWrite(
  path: string,
  data: Uint8Array | string,
  operations = { rename },
): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let created = false;
  try {
    const file = await open(temporary, "wx");
    created = true;
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    await operations.rename(temporary, path);
  } finally {
    if (created)
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
}
export function nativeFileDialogs(
  getWindow: () => BrowserWindow | undefined,
): FileDialogs {
  return {
    async open(kind) {
      const { dialog } = await import("electron"),
        win = getWindow(),
        options: OpenDialogOptions = {
          title:
            kind === "projectOnly"
              ? "打开工程文件"
              : kind === "song"
                ? "打开 NBS 歌曲"
                : kind === "project"
                  ? "打开工程 / NBS"
                  : kind === "phrase"
                    ? "导入 NBS 片段采样"
                    : kind === "sample"
                      ? "导入采样"
                      : "导入 NBS 乐器定义 / 采样 ZIP",
          properties: ["openFile"],
          filters: [
            kind === "projectOnly"
              ? { name: "Pomelene 工程", extensions: ["nbproject"] }
              : kind === "song"
                ? { name: "Note Block Song", extensions: ["nbs"] }
                : kind === "project"
                  ? {
                      name: "Pomelene Noteblock Project v2 / NBS Song",
                      extensions: ["nbproject", "nbs"],
                    }
                  : kind === "phrase"
                    ? { name: "NBS 音符片段采样", extensions: ["nbs"] }
                    : kind === "sample"
                      ? {
                          name: "音频采样",
                          extensions: [
                            "wav",
                            "ogg",
                            "mp3",
                            "flac",
                            "m4a",
                            "aac",
                            "webm",
                          ],
                        }
                      : {
                          name: "NBS / Instrument pack",
                          extensions: ["nbs", "zip"],
                        },
            { name: "所有文件", extensions: ["*"] },
          ],
        };
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options));
      return result.canceled ? undefined : result.filePaths[0];
    },
    async save(format, defaultPath) {
      const { dialog } = await import("electron"),
        win = getWindow(),
        options: SaveDialogOptions = {
          title:
            format === "project"
              ? "保存工程"
              : format === "nbs"
                ? "导出 NBS"
                : "导出乐器采样包",
          defaultPath,
          filters: [
            {
              name:
                format === "project"
                  ? "Pomelene Noteblock Project v2"
                  : format === "nbs"
                    ? "Note Block Song"
                    : "Instrument audio ZIP",
              extensions: [
                format === "project"
                  ? "nbproject"
                  : format === "nbs"
                    ? "nbs"
                    : "zip",
              ],
            },
          ],
        };
      const result = await (win
        ? dialog.showSaveDialog(win, options)
        : dialog.showSaveDialog(options));
      return result.canceled ? undefined : result.filePath;
    },
    async unsaved() {
      const { dialog } = await import("electron"),
        win = getWindow(),
        options: MessageBoxOptions = {
          type: "question",
          message: "是否保存当前工程的更改？",
          buttons: ["保存", "不保存", "取消"],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        };
      const result = await (win
        ? dialog.showMessageBox(win, options)
        : dialog.showMessageBox(options));
      return (
        (["save", "discard", "cancel"] as const)[result.response] ?? "cancel"
      );
    },
    async sounds() {
      const { dialog } = await import("electron"),
        win = getWindow(),
        options: OpenDialogOptions = {
          title: "选择 NBS 安装目录或 Sounds 文件夹以查找缺失采样（可取消）",
          properties: ["openDirectory"],
        };
      const result = await (win
        ? dialog.showOpenDialog(win, options)
        : dialog.showOpenDialog(options));
      return result.canceled ? undefined : result.filePaths[0];
    },
  };
}
function audioData(bytes: Uint8Array, path: string): string {
  if (bytes.length > MAX_AUDIO_BYTES)
    throw new Error("单个采样超过 32 MiB 限制");
  if (!isAudioPath(path)) throw new Error("不支持此音频格式");
  const ext = extname(path).toLowerCase(),
    mime: Record<string, string> = {
      ".wav": "wav",
      ".ogg": "ogg",
      ".mp3": "mpeg",
      ".flac": "flac",
      ".m4a": "mp4",
      ".aac": "aac",
      ".webm": "webm",
    };
  return `data:audio/${mime[ext]};base64,${Buffer.from(bytes).toString("base64")}`;
}
function wavDuration(bytes: Uint8Array): number | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    b.length < 44 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE"
  )
    return;
  let rate = 0,
    size = 0;
  for (let offset = 12; offset + 8 <= b.length; ) {
    const id = b.toString("ascii", offset, offset + 4),
      n = b.readUInt32LE(offset + 4);
    if (offset + 8 + n > b.length) return;
    if (id === "fmt " && n >= 16) rate = b.readUInt32LE(offset + 16);
    if (id === "data") size += n;
    offset += 8 + n + (n & 1);
  }
  return rate ? size / rate : undefined;
}
interface Options {
  session: Session;
  getWindow?: () => BrowserWindow | undefined;
  dialogs?: FileDialogs;
  storage?: FileStorage;
  onReplace?: () => void;
  soundsRoots?: string[];
  chooseImport?: (
    summary: NbsImportSummary,
    owner?: BrowserWindow,
  ) => Promise<ImportChoice>;
}
export class ProjectFiles {
  private dialogs: FileDialogs;
  private storage: FileStorage;
  private busy = false;
  private soundsRoots: string[];
  constructor(private options: Options) {
    this.dialogs =
      options.dialogs ??
      nativeFileDialogs(options.getWindow ?? (() => undefined));
    this.storage = options.storage ?? {
      read: async (path) => {
        const info = await stat(path);
        if (!info.isFile() || info.size > MAX_PROJECT_BYTES)
          throw new Error("文件超过 96 MiB 限制或不是普通文件");
        return readFile(path);
      },
      write: atomicWrite,
    };
    this.soundsRoots =
      options.soundsRoots ??
      (process.env.NBS_SOUNDS_PATH ? [process.env.NBS_SOUNDS_PATH] : []);
  }
  get isBusy(): boolean {
    return this.busy;
  }
  private result(ok: boolean, warnings: string[] = []): FileResult {
    return { ok, warnings, snapshot: this.options.session.snapshot() };
  }
  async confirmClose(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      return await this.mayReplace();
    } finally {
      this.busy = false;
    }
  }
  private async mayReplace(): Promise<boolean> {
    const s = this.options.session,
      before = s.snapshot();
    if (!before.document.dirty) return true;
    const choice = await this.dialogs.unsaved();
    if (s.snapshot().revision !== before.revision) return false;
    return (
      choice === "discard" ||
      (choice === "save" &&
        (await this.writeProject(false)) &&
        !s.snapshot().document.dirty)
    );
  }
  private async writeProject(force: boolean): Promise<boolean> {
    const session = this.options.session,
      before = session.snapshot();
    let path = force ? undefined : before.document.path;
    if (!path)
      path = await this.dialogs.save(
        "project",
        before.document.path ?? this.suggest(".nbproject"),
      );
    if (!path) return false;
    const saving = session.snapshot(),
      bytes = encodeProject(saving.project);
    await this.storage.write(path, bytes);
    // A save commits the serialized revision only. Later edits must remain dirty.
    if (
      session.snapshot().generation === saving.generation &&
      session.snapshot().revision === saving.revision
    )
      session.markSaved(path);
    return true;
  }
  private suggest(extension: string): string {
    return (
      (this.options.session
        .snapshot()
        .project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 100)
        .replace(/[. ]+$/, "") || "Untitled") + extension
    );
  }
  async action(action: FileAction): Promise<FileResult> {
    if (this.busy) return this.result(false);
    this.busy = true;
    try {
      if (action === "save" || action === "saveAs")
        return this.result(await this.writeProject(action === "saveAs"));
      if (action === "new") {
        if (!(await this.mayReplace())) return this.result(false);
        this.options.session.replace(createEmptyProject());
        this.options.onReplace?.();
        return this.result(true);
      }
      if (
        action === "open" ||
        action === "openSong" ||
        action === "openProject"
      ) {
        const owner = this.options.getWindow?.();
        const path = await this.dialogs.open(
          action === "openSong"
            ? "song"
            : action === "openProject"
              ? "projectOnly"
              : "project",
        );
        if (!path) return this.result(false);
        const bytes = await this.storage.read(path),
          warnings: string[] = [];
        const isProject = isProjectV2(bytes);
        if (action === "openProject" && !isProject)
          throw new Error(
            "请选择 .nbproject 工程文件；NBS 歌曲请使用“打开 .nbs 歌曲”",
          );
        if (action === "openSong" && isProject)
          throw new Error("此文件是工程，请使用“打开工程文件”而非打开歌曲");
        let project = decodeProject(bytes, path);
        if (!isProject && !this.options.chooseImport)
          warnings.push(...(project.nbs?.warnings ?? []));
        if (!isProject && this.options.chooseImport) {
          const organized = organizeImportedProject(project);
          if (project.nbsEvents?.length) {
            const events = project.nbsEvents;
            organized.summary.warnings.push(
              `保留 ${events.length} 个整曲 NBS 控制事件：速度 ${events.filter((e) => e.kind === "tempo").length}，停止 ${events.filter((e) => e.kind === "stop").length}，视觉 ${events.filter((e) => e.kind === "visual").length}。可在资源栏查看 tick / 图层位置；视觉效果仅保留、不执行，Show Save Popup 不会保存文件。`,
            );
          }
          organized.summary.fileName = basename(path);
          if (organized.project.importOrganization)
            organized.project.importOrganization.summary = structuredClone(
              organized.summary,
            );
          const choice = await this.options.chooseImport(
            organized.summary,
            owner,
          );
          if (choice === "cancel") return this.result(false);
          if (choice === "smart" && organized.summary.applicable)
            project = organized.project;
        }
        await this.resolveSamples(project, dirname(path), warnings, false);
        if (!(await this.mayReplace())) return this.result(false);
        this.options.session.replace(project);
        // Only v2 projects may become the Ctrl+S target. An NBS song can
        // have any extension, including one selected through “all files”.
        if (isProject) this.options.session.markSaved(path);
        this.options.onReplace?.();
        return this.result(true, warnings);
      }
      if (action === "exportNbs") {
        const converted = toNbs(this.options.session.snapshot().project),
          path = await this.dialogs.save("nbs", this.suggest(".nbs"));
        if (!path) return this.result(false);
        await this.storage.write(path, converted.data);
        return this.result(true, converted.warnings);
      }
      if (action === "exportInstruments") {
        const p = this.options.session.snapshot().project,
          entries = new Map<string, Uint8Array>(),
          warnings: string[] = [];
        for (const i of p.instruments.filter((i) => i.id >= 16)) {
          if (getNbsEventKind(i.name)) continue;
          const sample = p.samples.find((s) => s.id === i.sampleId)!;
          if (
            !sample.dataUrl &&
            i.mappingTargetId !== undefined &&
            !p.instruments.some(
              (other) =>
                other.sampleId === sample.id &&
                other.mappingTargetId === undefined,
            )
          ) {
            warnings.push(
              `乐器“${i.name}”已使用映射；原音频不可用，已从采样包省略，原定义仍随工程保留。`,
            );
            continue;
          }
          if (!sample.dataUrl)
            throw new Error(`乐器“${i.name}”缺少采样音频，请先导入对应资源包`);
          const relative = safeRelativePath(
              sample.originalPath ?? `${sample.name}.wav`,
            ),
            data = Buffer.from(sample.dataUrl.split(",")[1], "base64");
          const duplicate = [...entries.keys()].find(
            (n) => n.toLowerCase() === relative.toLowerCase(),
          );
          if (duplicate) {
            if (!Buffer.from(entries.get(duplicate)!).equals(data))
              throw new Error(`多个不同采样共用了路径：${relative}`);
            continue;
          }
          entries.set(relative, data);
        }
        if (!entries.size)
          return this.result(true, [
            ...warnings,
            "当前工程无需导出外部音频；NBS 控制定义随歌曲和工程保留，没有创建 ZIP 文件。",
          ]);
        const data = writeAudioZip(entries),
          path = await this.dialogs.save(
            "instruments",
            this.suggest("-instruments.zip"),
          );
        if (!path) return this.result(false);
        await this.storage.write(path, data);
        return this.result(true, [
          ...warnings,
          "采样包保留 NBS 乐器引用的相对路径。与对应 NBS 一同分发；在 NBS 中按上游方式导入采样 ZIP。",
        ]);
      }
      if (action === "importSample") {
        const path = await this.dialogs.open("sample");
        if (!path) return this.result(false);
        const bytes = await this.storage.read(path),
          duration = wavDuration(bytes),
          sample: Sample = {
            id: uid(),
            name: basename(path, extname(path)),
            color: "#c6a76a",
            dataUrl: audioData(bytes, path),
            originalPath: basename(path),
            rootKey: 60,
            volume: 100,
            panning: 100,
            ...(duration === undefined ? {} : { duration }),
          };
        this.options.session.transact((p) => p.samples.push(sample));
        return this.result(true);
      }
      if (action === "importInstruments") return await this.importInstruments();
      if (action === "importPhrase") return await this.importPhrase();
      throw new Error("未知文件操作");
    } finally {
      this.busy = false;
    }
  }
  private async importPhrase(): Promise<FileResult> {
    const generation = this.options.session.documentGeneration;
    const path = await this.dialogs.open("phrase");
    if (!path) return this.result(false);
    const bytes = await this.storage.read(path),
      warnings: string[] = [];
    if (bytes.byteLength > MAX_PROJECT_BYTES)
      throw new Error("文件超过 96 MiB 限制");
    if (isAudioPath(path))
      throw new Error("音频资源不能导入为 NBS 音符片段采样");
    const imported = fromNbs(bytes);
    if (imported.nbsEvents?.length)
      throw new Error(
        "此 NBS 含整曲控制事件，无法导入为片段采样。请使用“打开工程 / NBS”打开整首歌曲，以保留速度、停止和视觉控制事件；当前工程未更改。",
      );
    warnings.push(...(imported.nbs?.warnings ?? []));
    await this.resolveSamples(imported, dirname(path), warnings, false);
    const capture = new Session(imported).dispatch({
      type: "phrase:fromClips",
      ids: imported.clips.map((c) => c.id),
      name: imported.title || basename(path, extname(path)),
    }).project.phrases![0];
    for (const layer of capture.layers) delete layer.sourceIndex;
    if (this.options.session.documentGeneration !== generation)
      return this.result(false);
    const hostTempo = this.options.session.snapshot().project.bpm;
    if (hostTempo !== imported.bpm)
      warnings.push(
        `片段原速度为 ${imported.bpm} BPM；保留原始 tick，按当前工程 ${hostTempo} BPM 播放。`,
      );
    this.options.session.transact((p) => {
      const instrumentMap = new Map<number, number>();
      for (const oldId of new Set(capture.notes.map((n) => n.instrument))) {
        const instrument = imported.instruments.find((i) => i.id === oldId)!;
        const source = imported.samples.find(
          (s) => s.id === instrument.sampleId,
        )!;
        let sample = p.samples.find(
          (s) =>
            s.builtin === source.builtin &&
            s.dataUrl === source.dataUrl &&
            s.originalPath === source.originalPath &&
            s.rootKey === source.rootKey &&
            s.volume === source.volume &&
            s.panning === source.panning,
        );
        if (!sample) {
          sample = { ...source, id: uid() };
          p.samples.push(sample);
        }
        const existing = p.instruments.find(
          (i) =>
            i.sampleId === sample.id &&
            i.key === instrument.key &&
            i.pressKey === instrument.pressKey &&
            (oldId < 16
              ? i.id === oldId
              : i.id >= 16 && i.name === instrument.name),
        );
        let id = existing?.id;
        if (id === undefined) {
          id =
            oldId < 16 && !p.instruments.some((i) => i.id === oldId)
              ? oldId
              : Array.from({ length: 240 }, (_, index) => index + 16).find(
                  (id) =>
                    !p.instruments.some((i) => i.id === id) &&
                    !getNbsEventKind(
                      p.nbs?.customInstruments[id - 16]?.name ?? "",
                    ),
                );
          if (id === undefined) throw new Error("自定义乐器已达到 240 个上限");
          p.instruments.push({ ...instrument, id, sampleId: sample.id });
        }
        instrumentMap.set(oldId, id);
      }
      for (const note of capture.notes)
        note.instrument = instrumentMap.get(note.instrument)!;
      (p.phrases ??= []).push(capture);
    });
    return this.result(true, warnings);
  }
  private async resolveSamples(
    project: Project,
    base: string,
    warnings: string[],
    ask: boolean,
  ): Promise<void> {
    const audioSample = (id: string) => {
      const definitions = project.instruments.filter((i) => i.sampleId === id);
      return (
        !definitions.length || definitions.some((i) => !getNbsEventKind(i.name))
      );
    };
    const missing = async () => {
      let total = 0;
      for (const sample of project.samples) {
        if (
          !audioSample(sample.id) ||
          sample.builtin ||
          sample.dataUrl ||
          !sample.originalPath
        )
          continue;
        let relative: string;
        try {
          relative = safeRelativePath(sample.originalPath);
        } catch {
          warnings.push(`无法自动加载不安全的采样路径：${sample.name}`);
          continue;
        }
        const roots = [
          base,
          join(base, "Sounds"),
          ...this.soundsRoots.flatMap((p) => [p, join(p, "Sounds")]),
        ];
        for (const root of roots) {
          try {
            const path = resolve(root, relative);
            if (
              !path.toLowerCase().startsWith(resolve(root).toLowerCase() + sep)
            )
              continue;
            const bytes = await this.storage.read(path);
            total += bytes.length;
            if (total > MAX_AUDIO_TOTAL) throw new Error("采样总量超过限制");
            sample.dataUrl = audioData(bytes, path);
            const duration = wavDuration(bytes);
            if (duration !== undefined) sample.duration = duration;
            break;
          } catch {
            /* Try next read-only search root. */
          }
        }
      }
    };
    await missing();
    if (
      ask &&
      project.samples.some((s) => audioSample(s.id) && !s.builtin && !s.dataUrl)
    ) {
      const root = await this.dialogs.sounds();
      if (root) {
        this.soundsRoots.unshift(root);
        await missing();
      }
    }
    const unresolved = project.samples.filter(
      (s) => audioSample(s.id) && !s.builtin && !s.dataUrl,
    );
    if (unresolved.length)
      warnings.push(
        `${unresolved.length} 个自定义采样尚未找到。可导入上游 ZIP 采样包按路径自动关联：${unresolved
          .slice(0, 8)
          .map((s) => s.originalPath || s.name)
          .join("、")}`,
      );
  }
  private async importInstruments(): Promise<FileResult> {
    const path = await this.dialogs.open("instruments");
    if (!path) return this.result(false);
    const bytes = await this.storage.read(path),
      warnings: string[] = [];
    if (extname(path).toLowerCase() === ".zip") {
      const audio = readAudioZip(bytes);
      let repaired = 0,
        added = 0;
      this.options.session.transact((p) => {
        for (const [relative, bytes] of audio) {
          const normalized = relative.toLowerCase(),
            matches = p.samples.filter((s) => {
              if (s.builtin || !s.originalPath) return false;
              try {
                return (
                  safeRelativePath(s.originalPath)
                    .toLowerCase()
                    .replace(/^sounds\//, "") ===
                  normalized.replace(/^sounds\//, "")
                );
              } catch {
                return false;
              }
            });
          const dataUrl = audioData(bytes, relative),
            duration = wavDuration(bytes);
          if (matches.length)
            for (const s of matches) {
              s.dataUrl = dataUrl;
              if (duration !== undefined) s.duration = duration;
              repaired++;
            }
          else {
            p.samples.push({
              id: uid(),
              name: basename(relative, extname(relative)),
              color: "#ad9bd0",
              originalPath: relative,
              dataUrl,
              rootKey: 60,
              volume: 100,
              panning: 100,
              ...(duration === undefined ? {} : { duration }),
            });
            added++;
          }
        }
      });
      warnings.push(
        `已关联 ${repaired} 个乐器采样，新增 ${added} 个采样。音频 ZIP 不含乐器定义；如需自定义乐器，请同时导入对应 NBS。`,
      );
    } else {
      const imported = fromNbs(bytes);
      if (
        imported.nbsEvents?.length ||
        imported.nbs?.customInstruments.some((i) => getNbsEventKind(i.name))
      )
        warnings.push(
          "乐器资源导入只关联发声乐器；此 NBS 的整曲控制事件和控制定义未加入当前工程。请使用“打开工程 / NBS”打开整首歌曲，以完整保留控制信息。",
        );
      await this.resolveSamples(imported, dirname(path), warnings, true);
      this.options.session.transact((p) => {
        for (const inst of imported.instruments.filter((i) => i.id >= 16)) {
          const existing = p.instruments.find(
            (i) =>
              i.id >= 16 &&
              i.name === inst.name &&
              p.samples.find((s) => s.id === i.sampleId)?.originalPath ===
                imported.samples.find((s) => s.id === inst.sampleId)
                  ?.originalPath,
          );
          const source = imported.samples.find((s) => s.id === inst.sampleId)!;
          if (existing) {
            const sample = p.samples.find((s) => s.id === existing.sampleId)!;
            if (source.dataUrl) sample.dataUrl = source.dataUrl;
            continue;
          }
          const id = Array.from({ length: 240 }, (_, index) => index + 16).find(
            (id) =>
              !p.instruments.some((i) => i.id === id) &&
              !getNbsEventKind(p.nbs?.customInstruments[id - 16]?.name ?? ""),
          );
          if (id === undefined) throw new Error("自定义乐器已达到 240 个上限");
          const reusable = p.samples.find(
            (s) =>
              s.originalPath &&
              s.originalPath === source.originalPath &&
              s.dataUrl,
          );
          const sample = reusable ?? { ...source, id: uid() };
          if (!reusable) p.samples.push(sample);
          p.instruments.push({ ...inst, id, sampleId: sample.id });
        }
      });
      if (!imported.instruments.some((i) => i.id >= 16))
        warnings.push("此 NBS 没有自定义乐器定义。");
    }
    return this.result(true, warnings);
  }
}
