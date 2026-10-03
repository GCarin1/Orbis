// A sheet over a screen (specs/web-app): a panel on the right edge on a wide screen, the whole screen on a
// phone. Esc, the backdrop, the close button and the phone's Back close it.
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n.js";
import { addBackLayer } from "../native.js";
import { CloseIcon } from "./Icons.js";

export function Sheet({ title, onClose, children, testId }: { title: string; onClose(): void; children: ReactNode; testId?: string }) {
  const t = useT();
  // The latest close, so the Back layer and the key listener stay registered once.
  const close = useRef(onClose);
  close.current = onClose;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const forget = addBackLayer(() => close.current());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      forget();
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={() => close.current()}>
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t("computer.close")} title={t("computer.close")} onClick={() => close.current()}>
            <CloseIcon />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
}
