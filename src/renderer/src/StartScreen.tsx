import { useState } from "react";
import {
  Blocks,
  FileAudio,
  FolderOpen,
  Plus,
  Pause,
  Play,
  ArrowUpRight,
} from "lucide-react";
import { ChladniArt } from "./ChladniArt";
import type { FileAction } from "../../shared/model";
import "./start-screen.css";

export function StartScreen({
  busy,
  error,
  choose,
  example,
  initialSession,
}: {
  busy: boolean;
  error: string;
  choose: (action: FileAction) => void;
  example: () => void;
  initialSession: boolean;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <main className="start-screen" aria-label="开始页面" aria-busy={busy}>
      <ChladniArt paused={paused || busy} />
      <section className="start-content">
        <div className="start-brand">
          <Blocks size={22} />
          <span>
            Pomelene<small>Noteblock Editor</small>
          </span>
        </div>
        <h1>开始创作</h1>
        <div className="start-actions">
          <button onClick={() => choose("openSong")} disabled={busy} autoFocus>
            <FileAudio size={20} />
            <span>打开 .nbs 歌曲</span>
            <ArrowUpRight size={16} />
          </button>
          <button onClick={() => choose("openProject")} disabled={busy}>
            <FolderOpen size={20} />
            <span>
              打开工程文件 <small>.nbproject</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button onClick={() => choose("new")} disabled={busy}>
            <Plus size={20} />
            <span>新建工程</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
        {busy && (
          <p className="start-status" role="status">
            正在打开…
          </p>
        )}
        {error && (
          <p className="start-error" role="alert">
            {error}
          </p>
        )}
        <button className="start-example" disabled={busy} onClick={example}>
          {initialSession ? "查看示例工程" : "继续编辑当前工程"}
        </button>
      </section>
      <button
        className="start-animation-toggle"
        onClick={() => setPaused((v) => !v)}
        aria-pressed={paused}
        aria-label={paused ? "继续开屏动画" : "暂停开屏动画"}
        title={paused ? "继续动画" : "暂停动画"}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
    </main>
  );
}
