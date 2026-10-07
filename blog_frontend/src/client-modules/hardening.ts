import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

interface DevtoolsKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** Pure predicate: true for devtools / view-source shortcuts (F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U). */
export function isDevtoolsShortcut(e: DevtoolsKeyEvent): boolean {
  const key = (e.key || "").toLowerCase();
  const mod = Boolean(e.ctrlKey || e.metaKey);
  if (key === "f12") {
    return true;
  }
  if (mod && e.shiftKey && (key === "i" || key === "j" || key === "c")) {
    return true;
  }
  return mod && key === "u";
}

// Cosmetic client hardening (deterrent only, not a security boundary). Production builds only.
if (ExecutionEnvironment.canUseDOM && process.env.NODE_ENV === "production") {
  document.addEventListener("contextmenu", (event: Event) => event.preventDefault());
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isDevtoolsShortcut(event)) {
      event.preventDefault();
    }
  });
}
