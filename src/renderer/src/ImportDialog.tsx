import { useEffect, useId, useRef, useState } from "react";
import { Blocks, FileAudio, X } from "lucide-react";
import type { ImportPrompt, NbsImportSummary } from "../../shared/model";
import "./import-dialog.css";

export function ImportSummary({ summary }: { summary: NbsImportSummary }) {
  return (
    <div className="import-summary" role="region" aria-label="智能整理摘要">
      <div className="import-source">
        <FileAudio size={23} aria-hidden="true" />
        <div>
          <strong>{summary.title || "未命名歌曲"}</strong>
          <span>{summary.fileName}</span>
        </div>
      </div>
      <dl className="import-facts">
        <div>
          <dt>音符</dt>
          <dd>{summary.noteCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>图层</dt>
          <dd>{summary.layerCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>BPM</dt>
          <dd>{summary.bpm}</dd>
        </div>
        <div>
          <dt>拍号</dt>
          <dd>{summary.meter}</dd>
        </div>
      </dl>
      <table className="import-comparison" aria-label="整理前后布局对比">
        <thead>
          <tr>
            <th scope="col">布局</th>
            <th scope="col">Pattern</th>
            <th scope="col">引用</th>
            <th scope="col">声部轨道</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">原始整曲</th>
            <td>{summary.original.patterns}</td>
            <td>{summary.original.clips}</td>
            <td>{summary.original.tracks}</td>
          </tr>
          <tr className={summary.applicable ? "import-proposed" : ""}>
            <th scope="row">{summary.applicable ? "建议整理" : "保留原始"}</th>
            <td>{summary.proposed.patterns}</td>
            <td>{summary.proposed.clips}</td>
            <td>{summary.proposed.tracks}</td>
          </tr>
        </tbody>
      </table>
      {summary.groups.length > 0 && (
        <section className="import-groups" aria-label="建议声部分组">
          <div className="import-section-heading">
            <strong>建议声部分组</strong>
            <span>{summary.proposed.reusedClips} 个重复引用复用源 Pattern</span>
          </div>
          <ul>
            {summary.groups.map((group, index) => (
              <li key={index}>
                <Blocks size={13} aria-hidden="true" />
                <div>
                  <strong>{group.name}</strong>
                  <span>
                    源图层{" "}
                    {group.sourceLayers.map((layer) => layer + 1).join("、") ||
                      "无"}
                  </span>
                </div>
                <span className="import-group-counts">
                  {group.noteCount.toLocaleString()} 音符 · {group.patternCount}{" "}
                  Pattern · {group.clipCount} 引用
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.warnings.length > 0 && (
        <section className="import-warnings" aria-label="整理提示">
          <strong>整理提示</strong>
          <ul>
            {summary.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="import-preservation">
        只调整 Pattern
        分组与编排引用；不量化、不移动或删除音符，保留力度、声像、微调和采样尾音。
      </p>
      <p className="import-algorithm">
        整理算法 <code>{summary.algorithmVersion}</code>
      </p>
    </div>
  );
}

export function ImportDialog({
  prompt,
  respond,
}: {
  prompt: ImportPrompt;
  respond: (id: string, mode: "smart" | "original" | "cancel") => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    hintId = useId();
  const [smart, setSmart] = useState(prompt.summary.applicable);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog
      ?.querySelector<HTMLInputElement>("input:not(:disabled)")
      ?.focus({ preventScroll: true });
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  async function choose(mode: "smart" | "original" | "cancel") {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await respond(prompt.id, mode);
      // The main process clears the prompt after import or cancellation completes.
    } catch (reason) {
      submitting.current = false;
      setPending(false);
      setError(
        String(reason instanceof Error ? reason.message : reason).replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    }
  }
  return (
    <dialog
      ref={ref}
      className="import-dialog"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={pending}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        void choose("cancel");
      }}
    >
      <header className="import-header">
        <div>
          <span className="import-eyebrow">NBS IMPORT</span>
          <h2 id={titleId}>导入预览</h2>
        </div>
        <button
          type="button"
          aria-label="取消导入"
          disabled={pending}
          onClick={() => void choose("cancel")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className="import-scroll">
        <label
          className={`import-option${!prompt.summary.applicable ? " unavailable" : ""}`}
        >
          <input
            type="checkbox"
            checked={smart}
            disabled={!prompt.summary.applicable || pending}
            onChange={(event) => setSmart(event.target.checked)}
            aria-label="智能 Pattern 整理（Beta）"
            aria-describedby={hintId}
            autoFocus={prompt.summary.applicable}
          />
          <span>
            <strong>智能 Pattern 整理（Beta）</strong>
            <small id={hintId}>
              {prompt.summary.applicable
                ? "可关闭以保留原始整曲 Pattern；整理后可恢复原始导入布局。"
                : "此文件无法安全整理，将使用原始整曲 Pattern 布局导入。原因见整理提示。"}
            </small>
          </span>
        </label>
        <ImportSummary summary={prompt.summary} />
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="import-actions">
        <span role="status">
          {pending ? "正在处理…" : smart ? "按建议分组导入" : "按原始布局导入"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => void choose("cancel")}
        >
          取消
        </button>
        <button
          type="button"
          className="import-primary"
          disabled={pending}
          autoFocus={!prompt.summary.applicable}
          onClick={() =>
            void choose(
              smart && prompt.summary.applicable ? "smart" : "original",
            )
          }
        >
          导入
        </button>
      </footer>
    </dialog>
  );
}
