// A menu option that is on or off, showing which (change 0085): the label names the option, the switch its state.
import type { ReactNode } from "react";

export function MenuSwitch({ label, icon, on, onToggle }: { label: string; icon: ReactNode; on: boolean; onToggle(): void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className="menu-switch-item" onClick={onToggle}>
      {icon}
      <span>{label}</span>
      <span className={`menu-switch${on ? " on" : ""}`} aria-hidden="true" />
    </button>
  );
}
