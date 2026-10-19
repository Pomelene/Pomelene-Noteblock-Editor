import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BootGate } from "./BootSplash";
import "./studio.css";
import "./crystal-theme.css";
class Recovery extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="recovery">
        <h1>编辑视图遇到问题</h1>
        <p>{this.state.error}</p>
        <p>工程由主进程保留。可先保存，再重新加载界面。</p>
        <button onClick={() => void window.studio.file("saveAs")}>
          另存工程
        </button>
        <button onClick={() => location.reload()}>恢复界面</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Recovery>
    <BootGate>
      <App />
    </BootGate>
  </Recovery>,
);
