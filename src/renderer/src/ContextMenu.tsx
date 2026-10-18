import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import "./window.css";

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  shortcut?: string;
  separator?: boolean;
  children?: MenuItem[];
}

interface MenuDescription {
  x: number;
  y: number;
  items: MenuItem[];
}
interface MenuPanelProps extends MenuDescription {
  owner: string;
  onClose: () => void;
  onBack?: () => void;
  anchor?: DOMRect;
  autoFocus: boolean;
}

function MenuPanel({
  x,
  y,
  items,
  owner,
  onClose,
  onBack,
  anchor,
  autoFocus,
}: MenuPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.flatMap((item, index) =>
    !item.separator && !item.disabled ? [index] : [],
  );
  const [active, setActive] = useState(enabled[0] ?? -1);
  const [child, setChild] = useState<{
    index: number;
    anchor: DOMRect;
    keyboard: boolean;
  } | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const place = () => {
      const rect = panel.current?.getBoundingClientRect();
      if (!rect) return;
      let left = anchor ? anchor.right - 2 : x;
      if (anchor && left + rect.width > window.innerWidth - 8)
        left = anchor.left - rect.width + 2;
      const top = anchor ? anchor.top : y;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x, y, anchor, items]);

  useEffect(() => {
    if (autoFocus) {
      const first = items.findIndex(
        (item) => !item.separator && !item.disabled,
      );
      if (first >= 0) rows.current[first]?.focus({ preventScroll: true });
      else panel.current?.focus({ preventScroll: true });
    }
  }, [autoFocus, items]);

  const openChild = (index: number, keyboard: boolean) => {
    const item = items[index];
    const row = rows.current[index];
    if (!item?.disabled && item?.children?.length && row) {
      setChild({ index, anchor: row.getBoundingClientRect(), keyboard });
    } else setChild(null);
  };

  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled || item.separator) return;
    if (item.children?.length) {
      openChild(index, true);
      return;
    }
    try {
      item.action?.();
    } finally {
      onClose();
    }
  };

  const focus = (index: number) => {
    setActive(index);
    setChild(null);
    rows.current[index]?.focus();
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "ArrowRight",
        "ArrowLeft",
        "Home",
        "End",
        "Enter",
        " ",
        "Escape",
        "Tab",
      ].includes(key)
    )
      return;
    event.stopPropagation();
    if (key === "Tab") {
      onClose();
      return;
    }
    event.preventDefault();
    if (key === "Escape") {
      onClose();
      return;
    }
    if (key === "ArrowLeft") {
      onBack?.();
      return;
    }
    if (key === "ArrowRight") {
      openChild(active, true);
      return;
    }
    if (key === "Enter" || key === " ") {
      choose(active);
      return;
    }
    if (!enabled.length) return;
    if (key === "Home") {
      focus(enabled[0]);
      return;
    }
    if (key === "End") {
      focus(enabled[enabled.length - 1]);
      return;
    }
    const current = enabled.indexOf(active);
    const offset = key === "ArrowDown" ? 1 : -1;
    focus(enabled[(current + offset + enabled.length) % enabled.length]);
  };

  return createPortal(
    <>
      <div
        ref={panel}
        className="studio-context-menu"
        data-studio-menu={owner}
        data-testid="context-menu"
        role="menu"
        aria-label={onBack ? "子菜单" : "对象菜单"}
        tabIndex={-1}
        style={position}
        onKeyDown={keyDown}
        onContextMenu={(event) => event.preventDefault()}
        onScroll={() => setChild(null)}
      >
        {items.map((item, index) =>
          item.separator ? (
            <div
              key={index}
              className="studio-menu-separator"
              role="separator"
            />
          ) : (
            <button
              ref={(element) => {
                rows.current[index] = element;
              }}
              key={index}
              type="button"
              role={
                item.checked === undefined ? "menuitem" : "menuitemcheckbox"
              }
              aria-checked={item.checked}
              aria-disabled={Boolean(item.disabled)}
              aria-haspopup={item.children?.length ? "menu" : undefined}
              aria-expanded={
                item.children?.length ? child?.index === index : undefined
              }
              disabled={item.disabled}
              tabIndex={active === index ? 0 : -1}
              className={`studio-menu-item${item.danger ? " danger" : ""}${active === index ? " selected" : ""}`}
              onFocus={() => setActive(index)}
              onPointerEnter={() => {
                if (!item.disabled) {
                  setActive(index);
                  openChild(index, false);
                }
              }}
              onClick={() => choose(index)}
            >
              <span className="studio-menu-check" aria-hidden="true">
                {item.checked && <Check size={13} />}
              </span>
              <span className="studio-menu-label">{item.label}</span>
              {item.shortcut && (
                <span className="studio-menu-shortcut">{item.shortcut}</span>
              )}
              <span className="studio-menu-arrow" aria-hidden="true">
                {Boolean(item.children?.length) && <ChevronRight size={13} />}
              </span>
            </button>
          ),
        )}
      </div>
      {child && (
        <MenuPanel
          key={child.index}
          x={child.anchor.right}
          y={child.anchor.top}
          items={items[child.index].children!}
          owner={owner}
          onClose={onClose}
          onBack={() => {
            setChild(null);
            rows.current[child.index]?.focus({ preventScroll: true });
          }}
          anchor={child.anchor}
          autoFocus={child.keyboard}
        />
      )}
    </>,
    document.body,
  );
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuDescription | null;
  onClose: () => void;
}) {
  const owner = useId();
  const callback = useRef(onClose);
  callback.current = onClose;
  const close = useCallback(() => callback.current(), []);

  useLayoutEffect(() => {
    if (!menu) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target
          ?.closest("[data-studio-menu]")
          ?.getAttribute("data-studio-menu") !== owner
      ) {
        // Keep the dismissal pointerdown from overriding restored keyboard focus.
        event.preventDefault();
        close();
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [menu, owner, close]);

  return menu ? (
    <MenuPanel
      key={`${menu.x}:${menu.y}`}
      {...menu}
      owner={owner}
      onClose={close}
      autoFocus
    />
  ) : null;
}

export default ContextMenu;
