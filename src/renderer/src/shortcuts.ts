export type ShortcutContext = "global" | "playlist" | "pattern";
export type ShortcutAction =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "file:export"
  | "project:newPattern"
  | "source:rename"
  | "history:undo"
  | "history:redo"
  | "transport:toggle"
  | "transport:stop"
  | "help:show"
  | "window:playlist"
  | "window:source"
  | "window:minimizeAll"
  | "window:cycle"
  | "window:tile"
  | "window:maximize"
  | "tool:draw"
  | "tool:brush"
  | "tool:erase"
  | "tool:delete"
  | "tool:mute"
  | "tool:slip"
  | "tool:select"
  | "selection:all"
  | "selection:none"
  | "selection:invert"
  | "edit:copy"
  | "edit:cut"
  | "edit:paste"
  | "edit:duplicate"
  | "edit:delete"
  | "move:left"
  | "move:right"
  | "move:up"
  | "move:down"
  | "move:octaveUp"
  | "move:octaveDown"
  | "seek:start"
  | "seek:end"
  | "zoom:in"
  | "zoom:out"
  | "zoom:1"
  | "zoom:2"
  | "zoom:3"
  | "zoom:4"
  | "zoom:selection"
  | "snap:toggle"
  | "instrument:previous"
  | "instrument:next"
  | "instrument:previousUsed"
  | "instrument:nextUsed";
export interface ShortcutEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  target?: unknown;
}
export interface ShortcutDefinition {
  action: ShortcutAction;
  contexts: readonly ShortcutContext[];
  keys: string;
  label: string;
  key: string;
  mod?: boolean;
  shift?: boolean;
  repeat?: boolean;
}
const global: ShortcutContext[] = ["global"],
  editors: ShortcutContext[] = ["playlist", "pattern"];
const define = (
  action: ShortcutAction,
  contexts: ShortcutContext[],
  key: string,
  keys: string,
  label: string,
  mod = false,
  shift = false,
  repeat = false,
): ShortcutDefinition => ({
  action,
  contexts,
  key,
  keys,
  label,
  mod,
  shift,
  repeat,
});
export const shortcutRegistry: readonly ShortcutDefinition[] = [
  define("file:new", global, "n", "Ctrl+N", "新建工程", true),
  define("file:open", global, "o", "Ctrl+O", "打开工程", true),
  define("file:save", global, "s", "Ctrl+S", "保存工程", true),
  define("file:saveAs", global, "s", "Ctrl+Shift+S", "另存为", true, true),
  define("file:export", global, "e", "Ctrl+E", "导出 NBS", true),
  define("history:undo", global, "z", "Ctrl+Z", "撤销", true),
  define("history:redo", global, "y", "Ctrl+Y", "重做", true),
  define("history:redo", global, "z", "Ctrl+Shift+Z", "重做", true, true),
  define("transport:toggle", global, " ", "Space", "播放 / 暂停"),
  define("transport:stop", global, "escape", "Escape", "停止并返回起点"),
  define("help:show", global, "f1", "F1", "搜索快捷键"),
  define("source:rename", global, "f2", "F2", "重命名当前来源"),
  define("project:newPattern", global, "f4", "F4", "新建 Pattern"),
  define("window:playlist", global, "f5", "F5", "显示 Playlist"),
  define("window:source", global, "f7", "F7", "打开当前来源编辑器"),
  define("window:minimizeAll", global, "f12", "F12", "最小化所有编辑器"),
  define("window:cycle", global, "tab", "Ctrl+Tab", "切换编辑器", true),
  define(
    "window:cycle",
    global,
    "tab",
    "Ctrl+Shift+Tab",
    "反向切换编辑器",
    true,
    true,
  ),
  define(
    "window:tile",
    global,
    "h",
    "Ctrl+Shift+H",
    "平铺编辑器（主工作区）",
    true,
    true,
  ),
  define(
    "window:maximize",
    global,
    "enter",
    "Enter",
    "最大化 / 还原当前编辑器",
  ),
  define("tool:draw", editors, "p", "P", "绘制工具"),
  define("tool:brush", editors, "b", "B", "连续笔刷"),
  define("tool:select", editors, "e", "E", "选择工具"),
  define("tool:delete", editors, "d", "D", "删除工具"),
  define("tool:mute", ["playlist"], "t", "T", "静音引用工具"),
  define("tool:slip", ["playlist"], "s", "S", "滑移源内容工具"),
  define("selection:all", editors, "a", "Ctrl+A", "全选", true),
  define("selection:none", editors, "d", "Ctrl+D", "取消选择", true),
  define("selection:invert", editors, "i", "Shift+I", "反向选择", false, true),
  define("edit:copy", editors, "c", "Ctrl+C", "复制选区", true),
  define("edit:cut", editors, "x", "Ctrl+X", "剪切选区", true),
  define("edit:paste", editors, "v", "Ctrl+V", "粘贴", true),
  define("edit:duplicate", editors, "b", "Ctrl+B", "接续复制", true),
  define("edit:delete", editors, "delete", "Delete", "删除选区"),
  ...(["left", "right", "up", "down"] as const).map((direction, i) =>
    define(
      `move:${direction}`,
      editors,
      `arrow${direction}`,
      ["←", "→", "↑", "↓"][i],
      ["向左移动", "向右移动", "向上移动", "向下移动"][i],
      false,
      false,
      true,
    ),
  ),
  define(
    "move:octaveUp",
    ["pattern"],
    "arrowup",
    "Ctrl+↑",
    "升高八度",
    true,
    false,
    true,
  ),
  define(
    "move:octaveDown",
    ["pattern"],
    "arrowdown",
    "Ctrl+↓",
    "降低八度",
    true,
    false,
    true,
  ),
  define(
    "move:octaveUp",
    ["pattern"],
    "arrowup",
    "Shift+↑",
    "升高八度",
    false,
    true,
    true,
  ),
  define(
    "move:octaveDown",
    ["pattern"],
    "arrowdown",
    "Shift+↓",
    "降低八度",
    false,
    true,
    true,
  ),
  define("seek:start", editors, "home", "Home", "定位起点"),
  define("seek:end", editors, "end", "End", "定位内容末尾"),
  define("zoom:in", editors, "pageup", "PageUp", "放大", false, false, true),
  define(
    "zoom:out",
    editors,
    "pagedown",
    "PageDown",
    "缩小",
    false,
    false,
    true,
  ),
  define("zoom:1", editors, "1", "Shift+1", "缩放预设 1", false, true),
  define("zoom:2", editors, "2", "Shift+2", "缩放预设 2", false, true),
  define("zoom:3", editors, "3", "Shift+3", "缩放预设 3", false, true),
  define("zoom:4", editors, "4", "Shift+4", "适应全部内容", false, true),
  define("zoom:selection", editors, "5", "Shift+5", "适应选区", false, true),
  define("snap:toggle", editors, "backspace", "Backspace", "关闭 / 恢复吸附"),
  define("instrument:previous", ["pattern"], "g", "G", "上一个乐器 instrument"),
  define("instrument:next", ["pattern"], "k", "K", "下一个乐器 instrument"),
  define(
    "instrument:previousUsed",
    ["pattern"],
    "h",
    "H",
    "上一个已用乐器 instrument",
  ),
  define(
    "instrument:nextUsed",
    ["pattern"],
    "j",
    "J",
    "下一个已用乐器 instrument",
  ),
];
// Avoid instanceof: detached windows have a different DOM realm.
function protectedTarget(target: unknown, allowText = false): boolean {
  let node = target as {
    tagName?: string;
    isContentEditable?: boolean;
    parentElement?: unknown;
    getAttribute?: (name: string) => string | null;
  } | null;
  while (node) {
    const editable = node.getAttribute?.("contenteditable");
    if (
      (!allowText &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(
          node.tagName?.toUpperCase() ?? "",
        ) ||
          node.isContentEditable ||
          (editable != null && editable !== "false"))) ||
      ["dialog", "menu", "menuitem"].includes(
        node.getAttribute?.("role") ?? "",
      ) ||
      node.tagName?.toUpperCase() === "DIALOG"
    )
      return true;
    node = node.parentElement as typeof node;
  }
  return false;
}
export function isShortcutInput(target: unknown): boolean {
  return protectedTarget(target);
}
export function resolveShortcut(
  event: ShortcutEvent,
  context: ShortcutContext,
): ShortcutAction | undefined {
  if (event.altKey || (event.ctrlKey && event.metaKey)) return;
  const key =
    event.shiftKey && /^Digit[1-5]$/.test(event.code ?? "")
      ? event.code!.slice(-1)
      : event.key.toLowerCase();
  const action = shortcutRegistry.find(
    (row) =>
      row.contexts.includes(context) &&
      row.key === key &&
      !!row.mod === (event.ctrlKey || event.metaKey) &&
      !!row.shift === event.shiftKey &&
      (!event.repeat || row.repeat),
  )?.action;
  if (
    protectedTarget(
      event.target,
      context === "global" && !!action?.startsWith("file:"),
    )
  )
    return;
  if (context === "global" && (key === "enter" || key === " ")) {
    let node = event.target as {
      tagName?: string;
      parentElement?: unknown;
      getAttribute?: (name: string) => string | null;
    } | null;
    while (node) {
      if (
        ["BUTTON", "A", "SUMMARY"].includes(
          node.tagName?.toUpperCase() ?? "",
        ) ||
        ["button", "link"].includes(node.getAttribute?.("role") ?? "")
      )
        return;
      node = node.parentElement as typeof node;
    }
  }
  return action;
}
export function filterShortcuts(query: string): readonly ShortcutDefinition[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  return shortcutRegistry.filter((row) =>
    words.every((word) =>
      `${row.label} ${row.keys} ${row.contexts.join(" ")} ${row.action}`
        .toLowerCase()
        .includes(word),
    ),
  );
}
