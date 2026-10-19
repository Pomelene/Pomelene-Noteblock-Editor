import { useEffect, useState, type ReactNode } from "react";
import { connect, useStudio } from "./store";
import "./boot.css";

/** Deliberately plain placeholder; detailed opening artwork is a later design task. */
export function BootSplash({
  error,
  retry,
}: {
  error?: string;
  retry?: () => void;
}) {
  return (
    <main
      className="boot-splash"
      aria-label="Pomelene 启动界面"
      aria-busy={!error}
    >
      <div className="boot-identity">
        <span className="boot-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h1>Pomelene</h1>
        <p className="boot-product">Noteblock Editor</p>
      </div>
      {error ? (
        <div className="boot-error" role="alert">
          <p>暂时无法打开工作区</p>
          <small>{error}</small>
          <button onClick={retry}>重新尝试</button>
        </div>
      ) : (
        <p className="boot-status" role="status">
          正在打开工作区…
        </p>
      )}
    </main>
  );
}

export function BootGate({ children }: { children: ReactNode }) {
  const snapshot = useStudio(),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setError("");
    return connect((error) =>
      setError(error instanceof Error ? error.message : String(error)),
    );
  }, [attempt]);
  if (!snapshot)
    return (
      <BootSplash
        error={error}
        retry={() => setAttempt((value) => value + 1)}
      />
    );
  return children;
}
