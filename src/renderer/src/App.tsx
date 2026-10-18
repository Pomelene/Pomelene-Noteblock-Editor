import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Blocks,
  ChevronRight,
  FileAudio,
  FolderOpen,
  Grid2X2,
  LockKeyhole,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat2,
  Save,
  Search,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { useStudio, execute, accept, currentGeneration } from "./store";
import { audio } from "./audio";
import { WindowFrame, type EditorView } from "./WindowFrame";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Playlist } from "./Playlist";
import { PatternEditor } from "./PatternEditor";
import { SampleEditor } from "./SampleEditor";
import { InstrumentManager } from "./InstrumentManager";
import { PhrasePreview } from "./PhrasePreview";
import { ImportDialog, ImportSummary } from "./ImportDialog";
import { resolveShortcut } from "./shortcuts";
import { ShortcutHelp } from "./ShortcutHelp";
import { TransportPosition } from "./TransportPosition";
import { layoutWindows } from "./windowGeometry";
import type { FrameView } from "./WindowFrame";
import {
  type FileAction,
  type Command,
  type ImportPrompt,
  type TransportState,
} from "../../shared/model";
import type { Source, RequestText } from "./ui";
import { getSource } from "./ui";

interface TextDialog {
  title: string;
  value: string;
  submit: (value: string) => void;
}
export function App() {
  const snapshot = useStudio(),
    workspace = useRef<HTMLDivElement>(null),
    z = useRef(10);
  const projectRef = useRef(snapshot?.project);
  projectRef.current = snapshot?.project;
  const [source, setSource] = useState<Source>({ kind: "pattern", id: "" }),
    [views, setViews] = useState<EditorView[]>([]),
    [active, setActive] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | "pattern" | "phrase" | "sample">(
      "all",
    ),
    [sidebarWidth, setSidebarWidth] = useState(224);
  const [playlistView, setPlaylistView] = useState<FrameView>({
    id: "playlist",
    kind: "playlist",
    sourceId: "song",
    x: 18,
    y: 18,
    w: 920,
    h: 510,
    state: "maximized",
    z: 1,
  });
  const [browserVisible, setBrowserVisible] = useState(true);
  const [instrumentManagerOpen, setInstrumentManagerOpen] = useState(false);
  const [menuState, setMenuState] = useState<{
      x: number;
      y: number;
      items: MenuItem[];
    } | null>(null),
    [dialog, setDialog] = useState<TextDialog | null>(null),
    [info, setInfo] = useState<{
      title: string;
      body: ReactNode;
      className?: string;
      hideClose?: boolean;
    } | null>(null),
    [importPrompt, setImportPrompt] = useState<ImportPrompt | null>(null);
  const [status, setStatus] = useState("就绪"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [transport, setTransport] = useState<TransportState>(audio.getState()),
    [mode, setMode] = useState<"song" | "source">("song"),
    [stops, setStops] = useState(0);
  const native = new URLSearchParams(location.search),
    nativeKind = native.get("kind"),
    nativeId = native.get("id"),
    nativeSourceKind: Source["kind"] =
      nativeKind === "sample"
        ? "sample"
        : nativeKind === "phrase"
          ? "phrase"
          : "pattern";
  useEffect(
    () =>
      window.studio.onImportPrompt((prompt) => {
        if (prompt) {
          setInstrumentManagerOpen(false);
          setDialog(null);
          setInfo(null);
          setMenuState(null);
        }
        setImportPrompt(prompt);
      }),
    [],
  );
  useEffect(
    () =>
      audio.subscribe((s) => {
        setTransport(s);
        if (
          s.status === "playing" ||
          s.status === "loading" ||
          s.status === "paused"
        ) {
          setMode(s.scope === "song" ? "song" : "source");
        }
        if (s.error) setError(s.error);
        if (s.status === "stopped" && s.tick === 0) setStops((v) => v + 1);
      }),
    [],
  );
  useEffect(() => {
    if (snapshot) audio.updateProject(snapshot.project);
  }, [snapshot?.revision]);
  const initialGeneration = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!snapshot) return;
    if (initialGeneration.current !== undefined) audio.stop();
    initialGeneration.current = snapshot.generation;
    setViews([]);
    setInstrumentManagerOpen(false);
    setActive("");
    setPlaylistView((v) => ({ ...v, state: "maximized", z: 1 }));
    setSource(
      nativeKind && nativeKind !== "playlist" && nativeId
        ? { kind: nativeSourceKind, id: nativeId }
        : snapshot.project.patterns.length
          ? { kind: "pattern", id: snapshot.project.patterns[0].id }
          : { kind: "sample", id: snapshot.project.samples[0]?.id ?? "" },
    );
    if (nativeKind) setMode(nativeKind === "playlist" ? "song" : "source");
  }, [snapshot?.generation]);
  const project = snapshot?.project;
  useEffect(() => {
    if (!project || nativeKind) return;
    setSource((old) => {
      if (getSource(project, old)) return old;
      if (project.patterns[0])
        return { kind: "pattern", id: project.patterns[0].id };
      if (project.phrases?.[0])
        return { kind: "phrase", id: project.phrases[0].id };
      return { kind: "sample", id: project.samples[0]?.id ?? "" };
    });
    setViews((old) => {
      const valid = old.filter((v) =>
        getSource(project, { kind: v.kind, id: v.sourceId }),
      );
      return valid.length === old.length ? old : valid;
    });
  }, [project]);
  useEffect(() => {
    if (
      nativeKind ||
      !project ||
      !active ||
      views.some(
        (v) =>
          v.id === active &&
          v.state !== "minimized" &&
          getSource(project, { kind: v.kind, id: v.sourceId }),
      )
    )
      return;
    const next = views
      .filter(
        (v) =>
          v.state !== "minimized" &&
          getSource(project, { kind: v.kind, id: v.sourceId }),
      )
      .sort((a, b) => b.z - a.z)[0];
    setActive(next?.id ?? "");
    if (next) setSource({ kind: next.kind, id: next.sourceId });
    if (next || playlistView.state !== "minimized")
      requestAnimationFrame(() => focusEditor(next?.id ?? ""));
  }, [project, views, active, playlistView.state]);
  async function run(command: Command) {
    try {
      const s = await execute(command, snapshot?.generation);
      if (s.generation !== currentGeneration()) return undefined;
      setError("");
      return s;
    } catch (e) {
      if (snapshot?.generation !== currentGeneration()) return undefined;
      setError(cleanError(e));
      return undefined;
    }
  }
  async function file(action: FileAction) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.studio.file(action);
      accept(result.snapshot);
      if (result.ok) {
        if (action === "new" || action === "open") audio.stop();
        setStatus(
          {
            new: "已新建空白工程",
            open: "已打开工程",
            save: "工程已保存",
            saveAs: "工程已另存",
            exportNbs: "NBS 已导出",
            exportInstruments: "乐器采样包已导出",
            importSample: "音频资源已导入",
            importPhrase: "只读片段采样已导入",
            importInstruments: "乐器资源已关联",
          }[action],
        );
        if (action === "importPhrase") {
          const phrase = result.snapshot.project.phrases?.at(-1);
          if (phrase) {
            setFilter("phrase");
            openView({ kind: "phrase", id: phrase.id });
          }
        }
        if (result.warnings.length)
          setInfo({
            title: action === "exportNbs" ? "NBS 导出说明" : "资源与格式说明",
            body: (
              <>
                <ul>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                {action !== "exportNbs" &&
                  result.snapshot.project.instruments.some((instrument) => {
                    const sample = result.snapshot.project.samples.find(
                      (s) => s.id === instrument.sampleId,
                    );
                    return (
                      instrument.mappingTargetId === undefined &&
                      sample &&
                      !sample.builtin &&
                      !sample.dataUrl
                    );
                  }) && (
                    <button
                      className="accent-button"
                      onClick={() => {
                        setInfo(null);
                        setInstrumentManagerOpen(true);
                      }}
                    >
                      为缺失音色设置映射…
                    </button>
                  )}
              </>
            ),
          });
      }
      setError("");
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }
  function openView(s: Source) {
    if (!project) return;
    if (nativeKind) {
      void window.studio
        .openEditor(s.kind, s.id)
        .catch((e) => setError(cleanError(e)));
      return;
    }
    selectSource(s);
    const rect = workspace.current?.getBoundingClientRect(),
      count = views.filter((v) => v.state === "normal").length,
      id = crypto.randomUUID();
    setViews((v) => [
      ...v,
      {
        id,
        kind: s.kind,
        sourceId: s.id,
        x: 28 + ((count * 26) % 180),
        y: 110 + ((count * 22) % 130),
        w: Math.min(1040, (rect?.width ?? 1100) - 45),
        h: Math.min(520, (rect?.height ?? 650) - 130),
        state: "normal",
        z: ++z.current,
      },
    ]);
    setActive(id);
    requestAnimationFrame(() => focusEditor(id));
  }
  function focusEditor(id: string) {
    const frame = document.querySelector(
      `[data-view-id="${id || "playlist"}"]`,
    );
    (
      frame?.querySelector(
        ".playlist,.pattern-editor,.phrase-preview,.sample-editor",
      ) as HTMLElement | null
    )?.focus({ preventScroll: true });
  }
  function showPlaylist() {
    if (nativeKind) {
      if (nativeKind === "playlist")
        document.querySelector<HTMLElement>(".playlist")?.focus();
      else
        void window.studio
          .openEditor("playlist", "song")
          .catch((e) => setError(cleanError(e)));
      return;
    }
    setActive("");
    setPlaylistView((v) => ({
      ...v,
      state: v.state === "minimized" ? "normal" : v.state,
      z: ++z.current,
    }));
    requestAnimationFrame(() => focusEditor(""));
  }
  function arrangeWindows(mode: "tile" | "cascade") {
    const bounds = {
      width: workspace.current?.clientWidth ?? 1000,
      height: workspace.current?.clientHeight ?? 650,
    };
    const frames = [playlistView, ...views];
    const rects = layoutWindows(frames, bounds, mode);
    setPlaylistView((v) => ({
      ...v,
      ...rects[0],
      state: "normal",
      z: ++z.current,
    }));
    setViews((vs) =>
      vs.map((v, i) => ({
        ...v,
        ...rects[i + 1],
        state: "normal",
        z: ++z.current,
      })),
    );
    requestAnimationFrame(() => focusEditor(active));
  }
  function showShortcutHelp() {
    setInfo({
      title: "操作与快捷键",
      className: "shortcut-help-dialog",
      body: <ShortcutHelp />,
    });
  }
  useEffect(() => {
    if (nativeKind) return;
    return window.studio.onDockEditor((editor) => {
      if (editor.generation !== currentGeneration()) return;
      if (editor.kind === "playlist") showPlaylist();
      else openView({ kind: editor.kind, id: editor.id });
      if (editor.transport && project) {
        const state = editor.transport;
        setMode(state.scope === "song" ? "song" : "source");
        void audio
          .adoptTransport(project, state)
          .catch((e) => setError(cleanError(e)));
      }
    });
  }, [snapshot?.generation, views, project]);
  const showMenu = (x: number, y: number, items: MenuItem[]) =>
    setMenuState({ x, y, items });
  const requestText: RequestText = (title, value, submit) =>
    setDialog({ title, value, submit });
  async function createPattern(duplicateId?: string) {
    const s = await run({ type: "pattern:add", duplicateId });
    if (s) {
      const p = s.project.patterns.at(-1)!;
      openView({ kind: "pattern", id: p.id });
    }
  }
  async function freezePattern(patternId: string) {
    const s = await run({ type: "phrase:fromPattern", patternId });
    const phrase = s?.project.phrases?.at(-1);
    if (phrase) {
      setFilter("phrase");
      openView({ kind: "phrase", id: phrase.id });
      setStatus("已保存为只读片段采样");
    }
  }
  async function patternFromPhrase(phraseId: string) {
    const s = await run({ type: "pattern:fromPhrase", phraseId });
    const p = s?.project.patterns.at(-1);
    if (!p) return;
    setFilter("pattern");
    if (nativeKind)
      await window.studio
        .openEditor("pattern", p.id)
        .catch((e) => setError(cleanError(e)));
    else openView({ kind: "pattern", id: p.id });
    setStatus("已创建独立 Pattern；原片段采样保持只读");
  }
  function playPause() {
    if (!project) return;
    if (transport.status === "playing" || transport.status === "loading")
      audio.pause();
    else
      void audio
        .play(project, mode === "song" ? "song" : source.id)
        .catch((e) => setError(cleanError(e)));
  }
  function selectSource(next: Source) {
    const currentProject = projectRef.current;
    if (!currentProject || !getSource(currentProject, next)) return;
    setSource(next);
    const playing = audio.getState();
    if (
      mode === "source" &&
      playing.scope !== "song" &&
      playing.scope !== next.id &&
      (playing.status === "playing" || playing.status === "loading")
    )
      void audio
        .play(currentProject, next.id)
        .catch((e) => setError(cleanError(e)));
  }
  function stop() {
    audio.stop();
    setStops((v) => v + 1);
  }
  function sourceMenu(s: Source, x: number, y: number) {
    if (!project) return;
    selectSource(s);
    const obj = getSource(project, s);
    if (!obj) return;
    showMenu(x, y, [
      {
        label: s.kind === "phrase" ? "打开只读预览" : "打开编辑实例",
        action: () => openView(s),
      },
      {
        label: "弹出为桌面窗口",
        action: () =>
          void window.studio
            .openEditor(s.kind, s.id)
            .catch((e) => setError(cleanError(e))),
      },
      {
        label: "重命名",
        shortcut: "F2",
        action: () =>
          requestText(
            "重命名",
            obj.name,
            (name) =>
              void run(
                s.kind === "pattern"
                  ? { type: "pattern:update", id: s.id, patch: { name } }
                  : s.kind === "phrase"
                    ? { type: "phrase:update", id: s.id, patch: { name } }
                    : { type: "sample:update", id: s.id, patch: { name } },
              ),
          ),
      },
      {
        label: "颜色",
        children: [
          ["薄荷绿", "#82b5a2"],
          ["雾蓝", "#81a9c3"],
          ["紫藤", "#ad9ac6"],
          ["暖沙", "#d2ab7d"],
          ["珊瑚", "#cb9185"],
        ].map(([label, color]) => ({
          label,
          action: () =>
            void run(
              s.kind === "pattern"
                ? { type: "pattern:update", id: s.id, patch: { color } }
                : s.kind === "phrase"
                  ? { type: "phrase:update", id: s.id, patch: { color } }
                  : { type: "sample:update", id: s.id, patch: { color } },
            ),
        })),
      },
      {
        label: s.kind === "phrase" ? "根据采样创建 Pattern" : "创建独立副本",
        action: () => {
          if (s.kind === "pattern") void createPattern(s.id);
          else if (s.kind === "phrase") void patternFromPhrase(s.id);
          else
            void run({ type: "sample:clone", id: s.id }).then((r) => {
              if (r)
                openView({ kind: "sample", id: r.project.samples.at(-1)!.id });
            });
        },
      },
      ...(s.kind === "pattern"
        ? [{ label: "保存为片段采样", action: () => void freezePattern(s.id) }]
        : []),
      { separator: true, label: "" },
      {
        label: "删除对象及引用",
        danger: true,
        disabled:
          s.kind === "sample" &&
          project.instruments.some((i) => i.sampleId === s.id),
        action: () =>
          setInfo({
            title: `删除“${obj.name}”？`,
            body: (
              <>
                <p>相关编排引用也会删除。此操作可以撤销。</p>
                <div className="dialog-actions">
                  <button onClick={() => setInfo(null)}>取消</button>
                  <button
                    className="danger"
                    onClick={() => {
                      void run(
                        s.kind === "pattern"
                          ? { type: "pattern:remove", id: s.id }
                          : s.kind === "phrase"
                            ? { type: "phrase:remove", id: s.id }
                            : { type: "sample:remove", id: s.id },
                      );
                      setInfo(null);
                    }}
                  >
                    删除
                  </button>
                </div>
              </>
            ),
          }),
      },
    ]);
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      const action = resolveShortcut(e, "global");
      if (action) {
        e.preventDefault();
        if (action === "source:rename" && project) {
          const obj = getSource(project, source);
          if (obj)
            requestText(
              "重命名",
              obj.name,
              (name) =>
                void run(
                  source.kind === "pattern"
                    ? { type: "pattern:update", id: source.id, patch: { name } }
                    : source.kind === "phrase"
                      ? {
                          type: "phrase:update",
                          id: source.id,
                          patch: { name },
                        }
                      : {
                          type: "sample:update",
                          id: source.id,
                          patch: { name },
                        },
                ),
            );
        } else if (action === "project:newPattern") void createPattern();
        else if (action.startsWith("file:")) {
          (document.activeElement as HTMLElement)?.blur();
          const actions = {
            "file:new": "new",
            "file:open": "open",
            "file:save": "save",
            "file:saveAs": "saveAs",
            "file:export": "exportNbs",
          } as const;
          const fileAction = actions[action as keyof typeof actions];
          if (fileAction) void file(fileAction);
        } else if (action === "history:undo" || action === "history:redo")
          void run({ type: action === "history:undo" ? "undo" : "redo" });
        else if (action === "transport:toggle") playPause();
        else if (
          action === "transport:stop" &&
          !menuState &&
          transport.status !== "stopped"
        )
          stop();
        else if (action === "help:show") showShortcutHelp();
        else if (action === "window:playlist") showPlaylist();
        else if (action === "window:source") {
          const existing = views
            .filter((v) => v.sourceId === source.id && v.kind === source.kind)
            .sort((a, b) => b.z - a.z)[0];
          if (existing && !nativeKind) {
            setActive(existing.id);
            setViews((vs) =>
              vs.map((v) =>
                v.id === existing.id
                  ? {
                      ...v,
                      state: v.state === "minimized" ? "normal" : v.state,
                      z: ++z.current,
                    }
                  : v,
              ),
            );
            requestAnimationFrame(() => focusEditor(existing.id));
          } else openView(source);
        } else if (action === "window:minimizeAll") {
          if (nativeKind) void window.studio.controlWindow("minimize");
          else {
            setViews((vs) => vs.map((v) => ({ ...v, state: "minimized" })));
            setPlaylistView((v) => ({ ...v, state: "minimized" }));
            (document.activeElement as HTMLElement)?.blur();
          }
        } else if (action === "window:tile") {
          if (!nativeKind) arrangeWindows("tile");
        } else if (action === "window:maximize") {
          if (nativeKind) void window.studio.controlWindow("maximize");
          else if (!active)
            setPlaylistView((v) => ({
              ...v,
              state: v.state === "maximized" ? "normal" : "maximized",
            }));
          else
            setViews((vs) =>
              vs.map((v) =>
                v.id === active
                  ? {
                      ...v,
                      state: v.state === "maximized" ? "normal" : "maximized",
                    }
                  : v,
              ),
            );
        } else if (action === "window:cycle" && !nativeKind) {
          const candidates = [
            "",
            ...views
              .filter(
                (v) =>
                  v.state !== "minimized" &&
                  project &&
                  getSource(project, { kind: v.kind, id: v.sourceId }),
              )
              .map((v) => v.id),
          ].filter((id) => id || playlistView.state !== "minimized");
          if (!candidates.length) return;
          const index = candidates.indexOf(active),
            direction = e.shiftKey ? -1 : 1;
          const next =
            candidates[
              (index + direction + candidates.length) % candidates.length
            ];
          if (!next) showPlaylist();
          else {
            setActive(next);
            const v = views.find((v) => v.id === next)!;
            selectSource({ kind: v.kind, id: v.sourceId });
            setViews((vs) =>
              vs.map((v) => (v.id === next ? { ...v, z: ++z.current } : v)),
            );
            requestAnimationFrame(() => focusEditor(next));
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    snapshot,
    source,
    mode,
    transport.status,
    busy,
    menuState,
    views,
    active,
    playlistView,
  ]);
  if (!snapshot || !project)
    return (
      <div className="startup">
        <Blocks size={36} />
        <strong>NoteBlock Editor</strong>
        <span>正在载入工作区…</span>
      </div>
    );
  const selectedObj = getSource(project, source);
  const fileItems: MenuItem[] = [
    { label: "新建工程", shortcut: "Ctrl+N", action: () => void file("new") },
    {
      label: "打开工程 / NBS…",
      shortcut: "Ctrl+O",
      action: () => void file("open"),
    },
    { separator: true, label: "" },
    { label: "保存工程", shortcut: "Ctrl+S", action: () => void file("save") },
    {
      label: "工程另存为…",
      shortcut: "Ctrl+Shift+S",
      action: () => void file("saveAs"),
    },
    {
      label: "导出 NBS…",
      shortcut: "Ctrl+E",
      action: () => void file("exportNbs"),
    },
    { label: "导出乐器采样包…", action: () => void file("exportInstruments") },
    { separator: true, label: "" },
    { label: "导入 NBS 片段采样…", action: () => void file("importPhrase") },
    { label: "导入音频资源…", action: () => void file("importSample") },
    {
      label: "导入 NBS 乐器 / ZIP…",
      action: () => void file("importInstruments"),
    },
  ];
  const renderEditor = (s: Source) => {
    if (s.kind === "phrase") {
      const phrase = project.phrases?.find((p) => p.id === s.id);
      return phrase ? (
        <PhrasePreview
          key={phrase.id}
          phrase={phrase}
          tick={transport.scope === s.id ? transport.tick : undefined}
          playing={transport.scope === s.id && transport.status === "playing"}
          toggle={() => {
            selectSource(s);
            setMode("source");
            if (
              transport.scope === s.id &&
              (transport.status === "playing" || transport.status === "loading")
            )
              audio.pause();
            else
              void audio
                .play(project, s.id)
                .catch((e) => setError(cleanError(e)));
          }}
          stop={stop}
          createPattern={() => void patternFromPhrase(s.id)}
        />
      ) : (
        <div className="missing-source">片段采样已删除</div>
      );
    }
    if (s.kind === "pattern") {
      const p = project.patterns.find((p) => p.id === s.id);
      return p ? (
        <PatternEditor
          key={p.id}
          project={project}
          pattern={p}
          run={run}
          menu={showMenu}
          open={openView}
          report={setStatus}
          playTick={transport.scope === p.id ? transport.tick : undefined}
          stopped={stops}
          seek={(at) => {
            selectSource(s);
            setMode("source");
            audio.seek(at, s.id);
          }}
        />
      ) : (
        <div className="missing-source">源 Pattern 已删除</div>
      );
    }
    const sample = project.samples.find((p) => p.id === s.id);
    return sample ? (
      <SampleEditor
        key={sample.id}
        project={project}
        sample={sample}
        run={run}
        report={setStatus}
      />
    ) : (
      <div className="missing-source">采样已删除</div>
    );
  };
  const listRow = (
    s: Source,
    name: string,
    color: string,
    detail: string,
    index: number,
  ) => (
    <button
      key={s.id}
      data-testid={`source-${s.id}`}
      className={`source-row ${source.id === s.id && source.kind === s.kind ? "active" : ""}`}
      draggable
      onDragStart={(e) => {
        selectSource(s);
        e.dataTransfer.setData(
          "application/noteblock-source",
          JSON.stringify(s),
        );
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => selectSource(s)}
      onDoubleClick={() => openView(s)}
      onContextMenu={(e) => {
        e.preventDefault();
        sourceMenu(s, e.clientX, e.clientY);
      }}
    >
      <span className="source-icon" style={{ color }}>
        {s.kind === "pattern" ? (
          <Grid2X2 size={16} />
        ) : s.kind === "phrase" ? (
          <LockKeyhole size={16} />
        ) : (
          <AudioLines size={17} />
        )}
      </span>
      <span className="source-copy">
        <b>{name}</b>
        <small>{detail}</small>
      </span>
      <span className="source-index">{String(index + 1).padStart(2, "0")}</span>
    </button>
  );
  const renderPlaylist = () => (
    <Playlist
      project={project}
      source={source}
      chooseSource={selectSource}
      run={run}
      open={openView}
      menu={showMenu}
      text={requestText}
      tick={transport.scope === "song" ? transport.tick : 0}
      seek={(n) => {
        setMode("song");
        audio.seek(n, "song");
      }}
      stopped={stops}
      report={setStatus}
    />
  );
  return (
    <div
      className={`studio ${nativeKind ? "native-studio" : ""}`}
      data-dirty={String(snapshot.document.dirty)}
      data-revision={snapshot.revision}
    >
      {!nativeKind && (
        <>
          <div className="menubar">
            <span className="app-mark">
              <Blocks size={17} />
            </span>
            {[
              ["文件", fileItems],
              [
                "编辑",
                [
                  {
                    label: "撤销",
                    shortcut: "Ctrl+Z",
                    disabled: !snapshot.canUndo,
                    action: () => void run({ type: "undo" }),
                  },
                  {
                    label: "重做",
                    shortcut: "Ctrl+Y",
                    disabled: !snapshot.canRedo,
                    action: () => void run({ type: "redo" }),
                  },
                  { separator: true, label: "" },
                  {
                    label: "恢复原始导入布局…",
                    disabled: !project.importOrganization,
                    action: () =>
                      setInfo({
                        title: "恢复原始导入布局？",
                        hideClose: true,
                        body: (
                          <>
                            <p>
                              此操作会用导入时备份的原始布局替换当前全部
                              Pattern、音符、编排引用和轨道。导入后的音符与编排修改也会被替换。
                            </p>
                            <p>
                              乐器、采样与工程其它设置保留。此操作可以撤销。
                            </p>
                            <div className="dialog-actions">
                              <button onClick={() => setInfo(null)}>
                                取消
                              </button>
                              <button
                                className="danger"
                                onClick={() => {
                                  void run({
                                    type: "import:restoreOriginal",
                                  }).then((result) => {
                                    if (result)
                                      setStatus("已恢复原始导入布局，可撤销");
                                  });
                                  setInfo(null);
                                }}
                              >
                                恢复原始布局
                              </button>
                            </div>
                          </>
                        ),
                      }),
                  },
                ],
              ],
              [
                "添加",
                [
                  { label: "新建 Pattern", action: () => void createPattern() },
                  {
                    label: "导入 NBS 片段采样…",
                    action: () => void file("importPhrase"),
                  },
                  {
                    label: "导入音频资源…",
                    action: () => void file("importSample"),
                  },
                  {
                    label: "导入 NBS 乐器 / ZIP…",
                    action: () => void file("importInstruments"),
                  },
                  {
                    label: "自定义音色与映射…",
                    action: () => setInstrumentManagerOpen(true),
                  },
                  {
                    label: "新增编排轨道",
                    action: () => void run({ type: "track:add" }),
                  },
                ],
              ],
              [
                "窗口",
                [
                  {
                    label: "新建当前对象编辑实例",
                    disabled: !selectedObj,
                    action: () => openView(source),
                  },
                  {
                    label: "排列窗口",
                    action: () => arrangeWindows("cascade"),
                  },
                  {
                    label: "平铺所有窗口",
                    shortcut: "Ctrl+Shift+H",
                    action: () => arrangeWindows("tile"),
                  },
                  {
                    label: "显示整曲编排",
                    shortcut: "F5",
                    action: showPlaylist,
                  },
                  {
                    label: "打开所选对象",
                    shortcut: "F7",
                    disabled: !selectedObj,
                    action: () => openView(source),
                  },
                  {
                    label: browserVisible ? "隐藏对象浏览器" : "显示对象浏览器",
                    action: () => setBrowserVisible((v) => !v),
                  },
                  {
                    label: "恢复所有窗口",
                    action: () => {
                      setPlaylistView((v) => ({
                        ...v,
                        state: "normal",
                        z: ++z.current,
                      }));
                      setViews((v) =>
                        v.map((w) => ({ ...w, state: "normal" as const })),
                      );
                    },
                  },
                  { label: "关闭全部编辑窗口", action: () => setViews([]) },
                ],
              ],
              [
                "帮助",
                [
                  {
                    label: "智能整理报告…",
                    disabled: !project.importOrganization,
                    action: () => {
                      const organization = project.importOrganization;
                      if (!organization) return;
                      setInfo({
                        title: "智能整理报告",
                        className: "import-report",
                        body: (
                          <>
                            <p className="import-report-note">
                              此报告保存于工程，记录导入时的整理结果，不随后续编辑重新计算。报告版本：
                              <code>{organization.version}</code>。
                            </p>
                            <ImportSummary summary={organization.summary} />
                          </>
                        ),
                      });
                    },
                  },
                  {
                    label: "操作与快捷键",
                    shortcut: "F1",
                    action: showShortcutHelp,
                  },
                  {
                    label: "关于 NoteBlock Editor",
                    action: () =>
                      setInfo({
                        title: "NoteBlock Editor 0.7.0",
                        body: (
                          <p>
                            Windows 桌面编辑器 · 新工作区
                            <br />
                            Electron + React + TypeScript
                            <br />
                            基于 NBS 音符语义与 FL 工作方式重建。
                          </p>
                        ),
                      }),
                  },
                ],
              ],
            ].map(([label, items]) => (
              <button
                key={label as string}
                className="menu-trigger"
                onClick={(e) =>
                  showMenu(
                    e.currentTarget.getBoundingClientRect().left,
                    e.currentTarget.getBoundingClientRect().bottom,
                    items as MenuItem[],
                  )
                }
              >
                {label as string}
              </button>
            ))}
            <span className="spacer" />
            <span className="version-label">
              NOTE<b>BLOCK</b> <small>0.7</small>
            </span>
          </div>
          <header className="transport-bar">
            <div className="project-badge">
              <span className="project-icon">
                <Music2 size={20} />
              </span>
              <div>
                <button
                  className="project-name"
                  aria-label="重命名工程"
                  onClick={() =>
                    requestText(
                      "工程名称",
                      project.title,
                      (title) =>
                        void run({ type: "project:update", patch: { title } }),
                    )
                  }
                >
                  {project.title}
                  {snapshot.document.dirty && <i />}
                </button>
                <small title={snapshot.document.path}>
                  {snapshot.document.path?.split(/[\\/]/).at(-1) ??
                    "未保存的工程"}
                </small>
              </div>
            </div>
            <div className="transport-switch">
              <button
                className={mode === "song" ? "on" : ""}
                onClick={() => {
                  audio.stop();
                  setMode("song");
                }}
              >
                SONG
              </button>
              <button
                className={mode === "source" ? "on" : ""}
                title={`当前播放目标：${selectedObj?.name ?? "未选择来源"}`}
                data-playback-source={source.id}
                disabled={!selectedObj}
                onClick={() => {
                  audio.stop();
                  setMode("source");
                }}
              >
                {source.kind === "pattern" ? "PAT" : "SMP"}
              </button>
            </div>
            <button
              className={`transport-play ${transport.status === "playing" ? "playing" : ""}`}
              aria-label={transport.status === "playing" ? "暂停" : "播放"}
              title="播放 / 暂停 Space"
              onClick={playPause}
            >
              {transport.status === "playing" ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <button
              className="transport-stop"
              aria-label="终止"
              title="终止并归零"
              onClick={stop}
            >
              <Square size={16} fill="currentColor" />
            </button>
            <button
              className={`transport-loop ${project.loop.enabled ? "on" : ""}`}
              aria-label="循环播放"
              title={`循环 ${project.loop.start}–${project.loop.end} tick`}
              onClick={() =>
                void run({
                  type: "project:update",
                  patch: {
                    loop: { ...project.loop, enabled: !project.loop.enabled },
                  },
                })
              }
            >
              <Repeat2 size={17} />
            </button>
            <div className="transport-number">
              <label>TEMPO</label>
              <input
                aria-label="BPM"
                type="number"
                step={1}
                min={0.15}
                max={9830.25}
                key={project.bpm}
                defaultValue={project.bpm}
                onBlur={(e) => {
                  if (+e.target.value !== project.bpm)
                    void run({
                      type: "project:update",
                      patch: { bpm: +e.target.value },
                    });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <small>BPM</small>
            </div>
            <div className="transport-meter">
              <label>拍号</label>
              <select
                aria-label="拍号"
                value={project.meter}
                onChange={(e) =>
                  void run({
                    type: "project:update",
                    patch: { meter: e.target.value },
                  })
                }
              >
                {[
                  ...new Set([
                    project.meter,
                    "4/4",
                    "3/4",
                    "6/8",
                    "2/4",
                    "5/4",
                    "7/8",
                    "9/8",
                    "12/8",
                  ]),
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <TransportPosition tick={transport.tick} meter={project.meter} />
            <span className="spacer" />
            <div className="file-shortcuts">
              <button
                aria-label="打开工程"
                title="打开 Ctrl+O"
                disabled={busy}
                onClick={() => void file("open")}
              >
                <FolderOpen size={18} />
              </button>
              <button
                aria-label="保存工程"
                title="保存 Ctrl+S"
                disabled={busy}
                onClick={() => void file("save")}
              >
                <Save size={18} />
              </button>
              <button
                aria-label="导出 NBS"
                title="导出 NBS Ctrl+E"
                disabled={busy}
                onClick={() => void file("exportNbs")}
              >
                <FileAudio size={18} />
              </button>
              <span className="divider" />
              <button
                aria-label="撤销"
                disabled={!snapshot.canUndo}
                onClick={() => void run({ type: "undo" })}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="重做"
                disabled={!snapshot.canRedo}
                onClick={() => void run({ type: "redo" })}
              >
                <Redo2 size={17} />
              </button>
            </div>
          </header>
        </>
      )}
      {nativeKind && (
        <div className="native-bar">
          <Blocks size={15} />
          <b>
            {nativeKind === "playlist"
              ? "Playlist · 整曲编排"
              : nativeKind === "pattern"
                ? "Pattern 编辑实例"
                : nativeKind === "phrase"
                  ? "片段采样 · 只读预览"
                  : "音频资源实例"}
          </b>
          <span className="spacer" />
          <button
            aria-label={transport.status === "playing" ? "暂停" : "播放"}
            onClick={playPause}
          >
            {transport.status === "playing" ? (
              <Pause size={14} />
            ) : (
              <Play size={14} />
            )}
          </button>
          <button aria-label="终止" onClick={stop}>
            <Square size={13} />
          </button>
          <button aria-label="保存工程" onClick={() => void file("save")}>
            <Save size={14} />
          </button>
          <button
            aria-label="停靠回主窗口"
            title="停靠回主窗口"
            onClick={() =>
              void window.studio
                .dockEditor()
                .catch((e) => setError(cleanError(e)))
            }
          >
            停靠
          </button>
          <button
            aria-label="操作与快捷键"
            title="快捷键 F1"
            onClick={showShortcutHelp}
          >
            F1
          </button>
        </div>
      )}
      {!nativeKind ? (
        <div className="studio-body">
          <aside
            className="source-browser"
            style={{
              width: sidebarWidth,
              display: browserVisible ? undefined : "none",
            }}
          >
            <div className="browser-title">
              <FolderOpen size={14} />
              <strong>对象浏览器</strong>
              <span className="spacer" />
              <button
                title="添加对象"
                aria-label="添加对象"
                onClick={(e) =>
                  showMenu(e.clientX, e.clientY, [
                    {
                      label: "新建 Pattern",
                      action: () => void createPattern(),
                    },
                    {
                      label: "导入 NBS 片段采样…",
                      action: () => void file("importPhrase"),
                    },
                    {
                      label: "导入音频资源…",
                      action: () => void file("importSample"),
                    },
                    {
                      label: "导入 NBS 乐器 / ZIP…",
                      action: () => void file("importInstruments"),
                    },
                  ])
                }
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="browser-search">
              <Search size={13} />
              <input
                aria-label="搜索对象"
                placeholder="搜索 Pattern、片段采样或音频"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="browser-filters">
              {[
                ["all", "全部"],
                ["pattern", "Pattern"],
                ["phrase", "采样"],
                ["sample", "音频"],
              ].map(([key, name]) => (
                <button
                  className={filter === key ? "selected" : ""}
                  key={key}
                  onClick={() => setFilter(key as typeof filter)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="browser-items">
              {(filter === "all" || filter === "pattern") && (
                <>
                  <div className="library-label">
                    <Grid2X2 size={12} />
                    <span>PATTERNS</span>
                    <small>{project.patterns.length}</small>
                    <button
                      aria-label="新增 Pattern"
                      title="新增 Pattern"
                      onClick={() => void createPattern()}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {project.patterns
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p, i) =>
                      listRow(
                        { kind: "pattern", id: p.id },
                        p.name,
                        p.color,
                        `${p.length} ticks · ${p.notes.length} notes`,
                        i,
                      ),
                    )}
                  {!project.patterns.length && (
                    <button
                      className="browser-empty"
                      onClick={() => void createPattern()}
                    >
                      ＋ 创建第一个 Pattern
                    </button>
                  )}
                </>
              )}
              {(filter === "all" || filter === "phrase") && (
                <>
                  <div className="library-label">
                    <LockKeyhole size={12} />
                    <span>片段采样</span>
                    <small>{project.phrases?.length ?? 0}</small>
                    <button
                      aria-label="导入片段采样"
                      title="导入 NBS 只读片段"
                      onClick={() => void file("importPhrase")}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {(project.phrases ?? [])
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p, i) =>
                      listRow(
                        { kind: "phrase", id: p.id },
                        p.name,
                        p.color,
                        `只读 · ${p.length} ticks · ${p.notes.length} notes`,
                        i,
                      ),
                    )}
                  {!project.phrases?.length && (
                    <div className="phrase-library-empty">
                      <p>可复用的只读乐段</p>
                      <small>
                        导入 NBS，或把 Pattern / 编排选区保存为采样。
                      </small>
                      <button onClick={() => void file("importPhrase")}>
                        导入 NBS 片段
                      </button>
                      <button
                        disabled={source.kind !== "pattern" || !selectedObj}
                        onClick={() => void freezePattern(source.id)}
                      >
                        保存所选 Pattern 为采样
                      </button>
                    </div>
                  )}
                </>
              )}
              {(filter === "all" || filter === "sample") && (
                <details
                  className="audio-resource-library"
                  open={filter === "sample" ? true : undefined}
                >
                  <summary>
                    音频 / 乐器资源 <small>{project.samples.length}</small>
                  </summary>
                  <div className="library-label">
                    <AudioLines size={12} />
                    <span>AUDIO RESOURCES</span>
                    <small>{project.samples.length}</small>
                    <button
                      aria-label="自定义音色与映射"
                      title="自定义音色与映射"
                      onClick={() => setInstrumentManagerOpen(true)}
                    >
                      <Music2 size={12} />
                    </button>
                    <button
                      aria-label="导入音频资源"
                      title="导入音频资源"
                      onClick={() => void file("importSample")}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {project.samples
                    .filter((s) =>
                      s.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((s, i) =>
                      listRow(
                        { kind: "sample", id: s.id },
                        s.name,
                        s.color,
                        s.builtin
                          ? "原版 · 内置"
                          : s.dataUrl
                            ? "项目音频"
                            : "音频未关联",
                        i,
                      ),
                    )}
                </details>
              )}
            </div>
            <div className="browser-selected">
              <span
                className="source-icon"
                style={{ color: selectedObj?.color }}
              >
                {source.kind === "pattern" ? (
                  <Grid2X2 size={20} />
                ) : source.kind === "phrase" ? (
                  <LockKeyhole size={20} />
                ) : (
                  <AudioLines size={22} />
                )}
              </span>
              <div>
                <strong>{selectedObj?.name ?? "选择一个对象"}</strong>
                <small>
                  {source.kind === "pattern"
                    ? "PATTERN SOURCE"
                    : source.kind === "phrase"
                      ? "只读片段采样"
                      : "音频 / 乐器资源"}
                </small>
              </div>
              <button
                aria-label="打开所选对象"
                title={
                  source.kind === "phrase" ? "打开只读预览" : "新增编辑实例"
                }
                disabled={!selectedObj}
                onClick={() => openView(source)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </aside>
          <div
            className="browser-resizer"
            style={{ display: browserVisible ? undefined : "none" }}
            onPointerDown={(e) => {
              const el = e.currentTarget,
                start = e.clientX,
                width = sidebarWidth;
              el.setPointerCapture(e.pointerId);
              el.onpointermove = (move) =>
                setSidebarWidth(
                  Math.max(180, Math.min(380, width + move.clientX - start)),
                );
              el.onpointerup = () => {
                el.onpointermove = null;
                el.onpointerup = null;
              };
            }}
          />
          <div className="work-area">
            <div className="workspace" ref={workspace}>
              <WindowFrame
                view={playlistView}
                className="arrangement-window"
                title="Playlist · 整曲编排"
                active={!active}
                onChange={(patch) =>
                  setPlaylistView((v) => ({ ...v, ...patch }))
                }
                onFocus={() => {
                  if (active) setActive("");
                  if (active || playlistView.z < z.current)
                    setPlaylistView((v) => ({ ...v, z: ++z.current }));
                }}
                onClose={() =>
                  setPlaylistView((v) => ({ ...v, state: "minimized" }))
                }
                onPopout={() =>
                  void window.studio
                    .openEditor("playlist", "song")
                    .then(() =>
                      setPlaylistView((v) => ({ ...v, state: "minimized" })),
                    )
                    .catch((e) => setError(cleanError(e)))
                }
              >
                {renderPlaylist()}
              </WindowFrame>
              {views
                .filter(
                  (v) => !!getSource(project, { kind: v.kind, id: v.sourceId }),
                )
                .map((view) => (
                  <WindowFrame
                    key={view.id}
                    view={view}
                    title={
                      getSource(project, { kind: view.kind, id: view.sourceId })
                        ?.name ?? ""
                    }
                    active={active === view.id}
                    onChange={(patch) =>
                      setViews((v) =>
                        v.map((w) =>
                          w.id === view.id
                            ? { ...w, ...patch, kind: w.kind }
                            : w,
                        ),
                      )
                    }
                    onFocus={() => {
                      setActive(view.id);
                      selectSource({ kind: view.kind, id: view.sourceId });
                      setViews((v) =>
                        v.map((w) =>
                          w.id === view.id ? { ...w, z: ++z.current } : w,
                        ),
                      );
                    }}
                    onClose={() =>
                      setViews((v) => v.filter((w) => w.id !== view.id))
                    }
                    onPopout={() =>
                      void window.studio
                        .openEditor(view.kind, view.sourceId)
                        .then(() =>
                          setViews((v) => v.filter((w) => w.id !== view.id)),
                        )
                        .catch((e) => setError(cleanError(e)))
                    }
                  >
                    {renderEditor({ kind: view.kind, id: view.sourceId })}
                  </WindowFrame>
                ))}
            </div>
            <div className="window-dock">
              <button
                className={!active ? "active" : ""}
                onClick={showPlaylist}
              >
                <Grid2X2 size={13} />
                Playlist
              </button>
              {views.map((view) => (
                <button
                  key={view.id}
                  className={
                    active === view.id && view.state !== "minimized"
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setActive(view.id);
                    selectSource({ kind: view.kind, id: view.sourceId });
                    setViews((v) =>
                      v.map((w) =>
                        w.id === view.id
                          ? {
                              ...w,
                              state:
                                w.state === "minimized" ? "normal" : w.state,
                              z: ++z.current,
                            }
                          : w,
                      ),
                    );
                    requestAnimationFrame(() => focusEditor(view.id));
                  }}
                >
                  {view.kind === "pattern" ? (
                    <PianoIcon />
                  ) : view.kind === "phrase" ? (
                    <LockKeyhole size={12} />
                  ) : (
                    <AudioLines size={12} />
                  )}
                  <span>
                    {getSource(project, { kind: view.kind, id: view.sourceId })
                      ?.name ?? "已删除"}
                  </span>
                </button>
              ))}
              <span className="spacer" />
              <span className="dock-hint">双击对象新建编辑实例</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="native-content">
          {nativeKind === "playlist"
            ? renderPlaylist()
            : renderEditor({
                kind: nativeSourceKind,
                id: nativeId ?? "",
              })}
        </div>
      )}
      {error && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <footer className="statusbar" role="status">
        <span className={`status-dot ${busy ? "busy" : ""}`} />
        <span>
          {busy
            ? "正在处理文件…"
            : transport.status === "loading"
              ? "正在准备声音…"
              : status}
        </span>
        <span className="spacer" />
        <span className="transport-state">
          {transport.status === "playing"
            ? "PLAYING"
            : transport.status === "paused"
              ? "PAUSED"
              : "READY"}
        </span>
        <span>
          {[...project.patterns, ...(project.phrases ?? [])]
            .reduce((a, p) => a + p.notes.length, 0)
            .toLocaleString()}{" "}
          NOTES
        </span>
        <span>
          {snapshot.document.dirty
            ? "● 未保存"
            : snapshot.document.path
              ? "已保存"
              : "未写入文件"}
        </span>
      </footer>
      <ContextMenu menu={menuState} onClose={() => setMenuState(null)} />
      {importPrompt && (
        <ImportDialog
          key={importPrompt.id}
          prompt={importPrompt}
          respond={(id, mode) => window.studio.respondImport(id, mode)}
        />
      )}
      {!importPrompt && dialog && (
        <Dialog title={dialog.title} close={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget)
                .get("value")
                ?.toString()
                .trim();
              if (value) {
                dialog.submit(value);
                setDialog(null);
              }
            }}
          >
            <input
              name="value"
              aria-label={dialog.title}
              defaultValue={dialog.value}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button className="accent-button" type="submit">
                确定
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {!importPrompt && info && (
        <Dialog
          title={info.title}
          close={() => setInfo(null)}
          className={info.className}
        >
          {info.body}
          {!info.hideClose && (
            <div className="dialog-actions">
              <button onClick={() => setInfo(null)}>关闭</button>
            </div>
          )}
        </Dialog>
      )}
      {!importPrompt && instrumentManagerOpen && (
        <Dialog
          title="自定义音色与映射"
          close={() => setInstrumentManagerOpen(false)}
          className="instrument-manager-dialog"
        >
          <InstrumentManager project={project} run={run} report={setError} />
        </Dialog>
      )}
    </div>
  );
}
function PianoIcon() {
  return <Music2 size={12} />;
}
function cleanError(e: unknown) {
  return String(e instanceof Error ? e.message : e).replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
}
function Dialog({
  title,
  close,
  children,
  className,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef(`dialog-${crypto.randomUUID()}`);
  useEffect(() => {
    const dialog = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${className ?? ""}`}
      aria-labelledby={titleRef.current}
      onCancel={close}
    >
      <header>
        <strong id={titleRef.current}>{title}</strong>
        <button aria-label="关闭对话框" onClick={close}>
          <X size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
