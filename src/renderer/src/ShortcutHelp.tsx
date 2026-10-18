import { useState } from "react";
import { filterShortcuts } from "./shortcuts";
import "./shortcut-help.css";

export function ShortcutHelp({ onClose }: { onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const rows = filterShortcuts(query);
  return (
    <div className="shortcut-help">
      <p>
        快捷键作用于当前编辑器；输入框保留文字编辑操作。macOS 可使用 Command
        代替 Ctrl。
      </p>
      <input
        autoFocus
        aria-label="搜索快捷键"
        placeholder="搜索命令、按键或编辑器…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="shortcut-help-results" aria-live="polite">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>操作</th>
                <th>快捷键</th>
                <th>范围</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.action}-${index}`}>
                  <td>{row.label.replace(" instrument", "")}</td>
                  <td>
                    <kbd>{row.keys}</kbd>
                  </td>
                  <td>
                    {row.contexts
                      .map((scope) =>
                        scope === "global"
                          ? "全局"
                          : scope === "playlist"
                            ? "Playlist"
                            : "Pattern",
                      )
                      .join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p role="status">没有匹配的快捷键</p>
        )}
      </div>
      {onClose && <button onClick={onClose}>关闭</button>}
    </div>
  );
}
